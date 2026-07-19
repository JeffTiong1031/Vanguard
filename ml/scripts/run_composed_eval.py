"""Composed eval: stand-in NER -> align to gold -> score the classifier on NER-PROPOSED spans.

🔴 Why this exists. Tasks 16-17 train and score on author-perfect gold spans. Production feeds
the classifier spans a stock NER proposed — noisy boundaries, misses, extras. The gold-span
report is therefore an UPPER BOUND, and this task produces the honest integration number plus
the NER miss rate, reported SEPARATELY so the two failure sources are never conflated.

This is the in-track approximation using a stand-in NER. A composed eval on the LIVE Slice 1
NER is a mandatory integration gate after Slice 1 — this does not discharge it.

--ner-model is REQUIRED: the plan forbids silently assuming a licence. The chosen model must be
free, public and commercial-use OK, and the choice is recorded in the report so a reader can
check it. PERSON->PER, ORG/ORGANIZATION->ORG, LOC dropped (CLAUDE.md §8.1).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from sens.align import align_spans
from sens.marking import mark_span
from sens.metrics import mask_precision_recall
from sens.schema import Span
from sens.validate_jsonl import load_jsonl

_NER_MAP = {"PER": "PER", "PERSON": "PER", "ORG": "ORG", "ORGANIZATION": "ORG"}


def _proposed_spans(ner, text: str) -> list[tuple[int, int]]:
    spans = []
    for ent in ner(text):
        grp = _NER_MAP.get(str(ent.get("entity_group", "")).upper())
        if grp is None:
            continue  # LOC / MISC dropped
        spans.append((int(ent["start"]), int(ent["end"])))
    return spans


def main() -> None:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer, pipeline

    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--ner-model", required=True,
                    help="FREE/public/commercial-OK multilingual NER (licence is [verify] — record it)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--max-len", type=int, default=512)
    args = ap.parse_args()

    rows = load_jsonl(args.data)
    ner = pipeline("token-classification", model=args.ner_model, aggregation_strategy="simple")
    tok = AutoTokenizer.from_pretrained(str(args.model))
    clf = AutoModelForSequenceClassification.from_pretrained(str(args.model)).eval()
    id2label = clf.config.id2label

    gold_labels, pred_labels = [], []
    total_gold = total_miss = total_extra = 0
    miss_by_lang: dict[str, list[int]] = {}
    miss_examples = []

    with torch.no_grad():
        for ex in rows:
            res = align_spans(ex.spans, _proposed_spans(ner, ex.text))
            total_gold += len(ex.spans)
            total_miss += len(res.ner_misses)
            total_extra += len(res.ner_extras)
            m = miss_by_lang.setdefault(ex.lang, [0, 0])
            m[0] += len(res.ner_misses)
            m[1] += len(ex.spans)
            for g in res.ner_misses[:1]:
                miss_examples.append({"id": ex.id, "lang": ex.lang, "surface": g.surface,
                                      "entity_type": g.entity_type, "label": g.label,
                                      "text": ex.text})
            for (p_start, p_end), gold_label in res.matched:
                sp = Span(start=p_start, end=p_end, surface=ex.text[p_start:p_end],
                          entity_type="PER", label=gold_label)  # entity_type unused by mark_span
                enc = tok(mark_span(ex.text, sp), truncation=True, max_length=args.max_len,
                          return_tensors="pt")
                pi = int(clf(**enc).logits.argmax(-1))
                gold_labels.append(gold_label)
                pred_labels.append(id2label[pi])

    pr, rc = mask_precision_recall(gold_labels, pred_labels) if gold_labels else (0.0, 0.0)
    miss_rate = (total_miss / total_gold) if total_gold else 0.0

    # The number that matters for the product: a span the NER never proposes can never be
    # masked, whatever the classifier does. Integrated recall is bounded by NER recall.
    integrated_mask_recall_upper = (1.0 - miss_rate) * rc

    report = {
        "n_gold_spans": total_gold,
        "n_matched_spans": len(gold_labels),
        "classifier_mask_precision_on_ner_spans": pr,
        "classifier_mask_recall_on_ner_spans": rc,
        "ner_miss_rate": miss_rate,
        "ner_extra_count": total_extra,
        "ner_miss_rate_by_lang": {k: (v[0] / v[1] if v[1] else 0.0) for k, v in sorted(miss_by_lang.items())},
        "integrated_mask_recall_estimate": integrated_mask_recall_upper,
        "ner_model": args.ner_model,
        "ner_licence": "[verify] — confirm free/public/commercial-use before quoting this number",
        "classifier_model": str(args.model),
        "caveat": (
            "Stand-in NER, not the live Slice 1 NER. A composed eval on the shipped NER remains a "
            "mandatory integration gate. NER misses and classifier errors are reported separately "
            "and must never be merged into one accuracy figure."
        ),
        "ner_miss_examples": miss_examples[:15],
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    for k in ("n_gold_spans", "n_matched_spans", "classifier_mask_precision_on_ner_spans",
              "classifier_mask_recall_on_ner_spans", "ner_miss_rate", "ner_extra_count",
              "ner_miss_rate_by_lang", "integrated_mask_recall_estimate", "ner_model"):
        print(f"{k:42s} {report[k]}")


if __name__ == "__main__":
    main()
