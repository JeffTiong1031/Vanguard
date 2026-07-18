"""Validate + coverage-check an authored eval exam.

Hard failures are the plan's contract: schema/offsets, split=eval, provenance, required strata.
Advisory warnings are findings from the Task 14 draft that the contract does not encode — they
print but do not block, because the right count is a human judgement.

Note on `assert_no_eval_in_train`: it is deliberately NOT imported here. That guard protects the
TRAINING loader from eval rows; this script checks the opposite direction (an exam must be ALL
eval), which is done inline below. The plan's sketch imported it unused.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sens.coverage import missing_strata, stratum_counts
from sens.validate_jsonl import load_jsonl, validate_path

# Advisory only. Same list the Task 14 shortcut probe used; deliberately not exhaustive.
TITLES = ("Encik", "Puan", "Cik", "Cikgu", "Dato", "Datin", "Datuk", "Tuan", "Tun", "Sir", "Dr.",
          "Mr.", "Mrs.", "Ms.", "Miss", "Prof", "Tan Sri", "先生", "女士", "小姐", "太太", "经理",
          "老师", "医生", "总")


def _has_title(surface: str) -> bool:
    return any(t in surface for t in TITLES)


def main() -> None:
    ap = argparse.ArgumentParser(description="Validate + coverage-check an authored eval exam")
    ap.add_argument("path", type=Path)
    args = ap.parse_args()

    errs = validate_path(args.path)
    if errs:
        print("VALIDATION FAILED:\n" + "\n".join(errs))
        sys.exit(1)

    rows = load_jsonl(args.path)
    if not rows:
        print("EMPTY EXAM: no rows")
        sys.exit(1)

    non_eval = [e.id for e in rows if e.split != "eval"]
    if non_eval:
        print(f"NOT AN EXAM: rows are not split=eval: {non_eval[:5]}")
        sys.exit(1)

    # ADR 0021: an llm_synthetic exam can never yield SHIP_CANDIDATE. Catch it here, not after
    # a training run — the verdict would be honest and the input would be the wrong experiment.
    bad_prov = [e.id for e in rows if e.provenance not in ("human_simulated", "real")]
    if bad_prov:
        print(f"WRONG SUBSTRATE: exam rows must be human_simulated (or real), got "
              f"{ {e.provenance for e in rows} } e.g. {bad_prov[:5]}")
        print("  ADR 0021: a synthetic exam is structurally NOT_SHIPPED — it cannot be a ship signal.")
        sys.exit(1)

    counts = stratum_counts(rows)
    print("stratum counts (lang, entity_type, label):")
    for k, v in sorted(counts.items()):
        print(f"  {k}: {v}")

    n_mask = sum(v for (_, _, lab), v in counts.items() if lab == "MASK")
    n_keep = sum(v for (_, _, lab), v in counts.items() if lab == "KEEP")
    print(f"\nrows={len(rows)}  MASK spans={n_mask}  KEEP spans={n_keep}")

    # --- advisory warnings (never exit non-zero) ---
    warnings: list[str] = []

    if n_mask < 50:
        warnings.append(
            f"only {n_mask} MASK spans -> 95% CI is roughly +/-8pp or worse at 90% recall. "
            f"That may be too wide to support a ship decision (see eval-authoring-template.md)."
        )

    titled = [(e, sp) for e in rows for sp in e.spans if sp.entity_type == "PER" and _has_title(sp.surface)]
    titled_keep = [(e, sp) for e, sp in titled if sp.label == "KEEP"]
    print(f"titled PER spans={len(titled)}  of which KEEP={len(titled_keep)}")
    if len(titled_keep) < 5:
        warnings.append(
            f"only {len(titled_keep)} titled-KEEP spans. The Task 14 draft had P(MASK|title)~0.98, so a "
            f"model can pass by learning 'title -> MASK'. An exam without titled-KEEP scores that "
            f"shortcut as SUCCESS and cannot detect it."
        )

    langs_with_mask = {lang for (lang, _, lab) in counts if lab == "MASK"}
    for lang in ("en", "bm", "zh"):
        if lang not in langs_with_mask:
            warnings.append(f"no MASK spans in lang={lang} — that language's recall is unmeasurable.")

    if warnings:
        print("\nADVISORY (not blocking):")
        for w in warnings:
            print(f"  ! {w}")

    miss = missing_strata(rows)
    if miss:
        print(f"\nCOVERAGE INCOMPLETE — missing: {miss}")
        sys.exit(1)
    print("\nCOVERAGE COMPLETE")


if __name__ == "__main__":
    main()
