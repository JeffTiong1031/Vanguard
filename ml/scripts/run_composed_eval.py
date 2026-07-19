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


def gold_coverage(gold_start: int, gold_end: int, proposed: list[tuple[int, int]]) -> float:
    """Fraction of the gold span's characters covered by ANY proposal.

    🔴 This exists because align_spans counts any overlap as a match, and for masking that
    is the wrong question. A one-character proposal against 阿里巴巴 overlaps, so it aligns
    — but masking 阿 and leaving 里巴巴 in the prompt is not a detection, it is a leak with
    a receipt. Measured 2026-07-19: ~23% of gold spans are covered only in fragments
    (Encik Rahman -> "En" + "Rahman"; 鲁迅先生 -> "鲁" + "鲁迅"), so ner_miss_rate reported
    3.8% where the effective miss was ~34%.

    Partial coverage is counted as a miss for MASK purposes: the sensitive value is only
    protected if the whole of it is replaced. Over-long proposals are not penalised here —
    masking extra text is a utility cost, not a privacy failure.
    """
    if gold_end <= gold_start:
        return 0.0
    covered: set[int] = set()
    for ps, pe in proposed:
        for i in range(max(ps, gold_start), min(pe, gold_end)):
            covered.add(i)
    return len(covered) / (gold_end - gold_start)


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
    ap.add_argument("--repair-spans", action="store_true",
                    help="merge fragmented NER proposals and pull attached honorifics into the "
                         "span (doc 04 4.3). Measured +22pp full MASK coverage on the exam.")
    ap.add_argument("--repair-gap", type=int, default=0,
                    help="also bridge proposals this many chars apart; >0 raises over-extension")
    args = ap.parse_args()

    from sens.span_repair import repair_spans

    rows = load_jsonl(args.data)
    ner = pipeline("token-classification", model=args.ner_model, aggregation_strategy="simple")
    tok = AutoTokenizer.from_pretrained(str(args.model))
    clf = AutoModelForSequenceClassification.from_pretrained(str(args.model)).eval()
    id2label = clf.config.id2label

    gold_labels, pred_labels = [], []
    total_gold = total_miss = total_extra = 0
    full_cov = partial_cov = zero_cov = 0
    mask_full = mask_total = 0
    miss_by_lang: dict[str, list[int]] = {}
    mask_cov_by_lang: dict[str, list[int]] = {}
    miss_examples = []
    fragment_examples = []

    with torch.no_grad():
        for ex in rows:
            proposed = _proposed_spans(ner, ex.text)
            if args.repair_spans:
                proposed = repair_spans(proposed, ex.text, gap=args.repair_gap)
            res = align_spans(ex.spans, proposed)
            total_gold += len(ex.spans)
            total_miss += len(res.ner_misses)
            total_extra += len(res.ner_extras)
            m = miss_by_lang.setdefault(ex.lang, [0, 0])
            m[0] += len(res.ner_misses)
            m[1] += len(ex.spans)

            # Boundary quality — the number align_spans cannot see.
            for g in ex.spans:
                frac = gold_coverage(g.start, g.end, proposed)
                if frac >= 0.999:
                    full_cov += 1
                elif frac > 0:
                    partial_cov += 1
                    if len(fragment_examples) < 15:
                        frags = [ex.text[ps:pe] for ps, pe in proposed
                                 if max(0, min(pe, g.end) - max(ps, g.start)) > 0]
                        fragment_examples.append({
                            "id": ex.id, "lang": ex.lang, "gold": g.surface,
                            "label": g.label, "fragments": frags,
                            "covered_fraction": round(frac, 3)})
                else:
                    zero_cov += 1
                if g.label == "MASK":
                    mask_total += 1
                    c = mask_cov_by_lang.setdefault(ex.lang, [0, 0])
                    c[1] += 1
                    if frac >= 0.999:
                        mask_full += 1
                        c[0] += 1
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
    mask_full_rate = (mask_full / mask_total) if mask_total else 0.0

    # 🔴 Read THIS one, not ner_miss_rate. A fragment aligns but does not protect anything,
    # so the effective miss is 1 - mask_full_coverage_rate, roughly ten times ner_miss_rate
    # on the models measured so far.
    integrated_mask_recall_estimate = mask_full_rate * rc
    integrated_optimistic = (1.0 - miss_rate) * rc

    report = {
        "n_gold_spans": total_gold,
        "n_matched_spans": len(gold_labels),
        "classifier_mask_precision_on_ner_spans": pr,
        "classifier_mask_recall_on_ner_spans": rc,
        "mask_full_coverage_rate": mask_full_rate,
        "mask_effective_miss_rate": 1.0 - mask_full_rate,
        "mask_full_coverage_by_lang": {k: (v[0] / v[1] if v[1] else 0.0)
                                       for k, v in sorted(mask_cov_by_lang.items())},
        "span_boundary_quality": {
            "full_coverage": full_cov,
            "fragment_only": partial_cov,
            "no_overlap": zero_cov,
            "fragment_rate": (partial_cov / total_gold) if total_gold else 0.0,
        },
        "ner_miss_rate": miss_rate,
        "ner_miss_rate_note": (
            "counts only spans with NO overlap. It IGNORES fragments, which align but do not "
            "protect the value — use mask_effective_miss_rate for the product number."
        ),
        "ner_extra_count": total_extra,
        "ner_miss_rate_by_lang": {k: (v[0] / v[1] if v[1] else 0.0) for k, v in sorted(miss_by_lang.items())},
        "integrated_mask_recall_estimate": integrated_mask_recall_estimate,
        "integrated_mask_recall_optimistic": integrated_optimistic,
        "fragment_examples": fragment_examples,
        "span_repair_applied": bool(args.repair_spans),
        "span_repair_gap": args.repair_gap if args.repair_spans else None,
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
    for k in ("n_gold_spans", "classifier_mask_precision_on_ner_spans",
              "classifier_mask_recall_on_ner_spans", "mask_full_coverage_rate",
              "mask_effective_miss_rate", "mask_full_coverage_by_lang",
              "span_boundary_quality", "ner_miss_rate",
              "integrated_mask_recall_estimate", "integrated_mask_recall_optimistic",
              "ner_model"):
        print(f"{k:38s} {report[k]}")


if __name__ == "__main__":
    main()
