"""Gold-span eval: score the classifier on author-perfect spans, then apply the ship gate.

🔴 This is an UPPER BOUND. It hands the model the exam's gold spans, so it isolates the
sensitivity decision and assumes NER is perfect. Integrated recall is bounded by NER recall,
measured in Task 18 (composed) and again on the live NER at integration. Read every number
here as "the classifier's ceiling", never as the integrated system's accuracy.

build_report() is deliberately torch-free so the gate wiring can be unit-tested without a
checkpoint (tests/test_run_eval_gate_wiring.py). Inference lives in _predict().
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from sens.coverage import missing_strata, stratum_counts
from sens.eval_gate import ship_status
from sens.metrics import full_mention_coverage, mask_precision_recall
from sens.validate_jsonl import load_jsonl

AUTHORSHIP_NOTE = (
    "human_simulated exam authored by founder/team; curated approximation of Malaysian office "
    "code-switching, not a sample of production traffic. A small author pool carries register "
    "bias, so a green score is not field proof. ADR 0015 residual: the human_simulated waiver "
    "does NOT discharge the real-substrate requirement for a production ship."
)


def build_report(rows, gold, pred, entities, extra=None):
    pr, rc = mask_precision_recall(gold, pred)
    miss = missing_strata(rows)
    # predictions= is what catches an always-MASK model; recall alone cannot see it.
    status, reasons = ship_status(rows, mask_recall=rc, missing_strata=miss, predictions=pred)
    report = {
        "n_spans": len(gold),
        "mask_precision": pr,
        "mask_recall": rc,
        "full_mention_coverage": full_mention_coverage(entities),
        "stratum_counts": {",".join(k): v for k, v in stratum_counts(rows).items()},
        "missing_strata": miss,
        "ship_status": status,
        "reasons": reasons,
        "authorship_note": AUTHORSHIP_NOTE,
        "caveat": "GOLD-SPAN eval — an upper bound. Integrated recall is NER-bounded (Task 18).",
    }
    if extra:
        report.update(extra)
    return report


def per_stratum_errors(rows, gold, pred):
    """Where the errors actually are. An aggregate number hides the strata that matter."""
    from collections import defaultdict

    buckets = defaultdict(lambda: {"n": 0, "wrong": 0})
    titled = {"n": 0, "wrong": 0}
    TITLES = ("Encik", "Puan", "Cik", "Cikgu", "Dato", "Datin", "Datuk", "Tuan", "Tun", "Sir",
              "Dr.", "Mr.", "Mrs.", "Ms.", "Miss", "Prof", "Tan Sri", "先生", "女士", "小姐",
              "太太", "经理", "老师", "医生", "总")
    i = 0
    for ex in rows:
        for sp in ex.spans:
            key = f"{ex.lang},{sp.entity_type},{sp.label}"
            buckets[key]["n"] += 1
            wrong = gold[i] != pred[i]
            if wrong:
                buckets[key]["wrong"] += 1
            if sp.entity_type == "PER" and sp.label == "KEEP" and any(t in sp.surface for t in TITLES):
                titled["n"] += 1
                titled["wrong"] += int(wrong)
            i += 1
    return dict(buckets), titled


def _predict(model_dir: str, rows, max_len: int):
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    from sens.marking import iter_span_instances

    tok = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir).eval()
    id2label = model.config.id2label

    gold, pred = [], []
    entities: dict[str, list[bool]] = {}
    with torch.no_grad():
        for ex in rows:
            for (marked, label, _etype), sp in zip(iter_span_instances(ex), ex.spans):
                enc = tok(marked, truncation=True, max_length=max_len, return_tensors="pt")
                pi = int(model(**enc).logits.argmax(-1))
                plabel = id2label[pi]
                gold.append(label)
                pred.append(plabel)
                if label == "MASK":  # 100%-mention coverage is measured over true-MASK mentions
                    key = f"{ex.id}:{sp.surface.lower()}"
                    entities.setdefault(key, []).append(plabel == "MASK")
    return gold, pred, entities


def main() -> None:
    ap = argparse.ArgumentParser(description="Gold-span eval + ship gate")
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--max-len", type=int, default=512)
    args = ap.parse_args()

    rows = load_jsonl(args.data)
    gold, pred, entities = _predict(str(args.model), rows, args.max_len)
    strata, titled = per_stratum_errors(rows, gold, pred)
    report = build_report(rows, gold, pred, entities, extra={
        "model_dir": str(args.model),
        "data_file": str(args.data),
        "per_stratum_errors": strata,
        "titled_keep_probe": titled,
        "pred_distribution": {lab: pred.count(lab) for lab in sorted(set(pred))},
    })

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
