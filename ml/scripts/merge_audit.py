from __future__ import annotations

import argparse
from pathlib import Path

from sens.disagreement import disagreement_by_lang, disagreement_rate
from sens.validate_jsonl import load_jsonl, validate_path


def main() -> None:
    ap = argparse.ArgumentParser(description="Merge audited labels over an LLM draft; report disagreement")
    ap.add_argument("--draft", type=Path, required=True, help="LLM-drafted JSONL")
    ap.add_argument("--audit", type=Path, required=True, help="human-audited JSONL (same ids)")
    ap.add_argument("--out", type=Path, required=True, help="merged training JSONL (AUDITED rows only)")
    ap.add_argument("--allow-unaudited", action="store_true",
                    help="also emit draft rows with NO human audit (DANGEROUS — trains on raw LLM labels)")
    args = ap.parse_args()

    for p in (args.draft, args.audit):
        errs = validate_path(p)
        if errs:
            raise SystemExit("validation failed:\n" + "\n".join(errs))

    draft = load_jsonl(args.draft)
    audit = load_jsonl(args.audit)
    print(f"overall disagreement: {disagreement_rate(draft, audit):.3f}")
    for lang, rate in sorted(disagreement_by_lang(draft, audit).items()):
        print(f"  {lang}: {rate:.3f}")
    print("REVIEW: if BM/ZH disagreement looks material, STOP and ask the founder (no hardcoded cutoff).")

    audited_ids = {e.id for e in audit}
    unaudited = [e for e in draft if e.id not in audited_ids]
    if unaudited and not args.allow_unaudited:
        raise SystemExit(
            f"{len(unaudited)} draft rows were NOT audited (e.g. {[e.id for e in unaudited][:5]}). "
            f"Default merge emits AUDITED rows only — training on un-audited LLM labels is forbidden. "
            f"Re-run with --allow-unaudited only if the founder accepts raw LLM labels for those rows."
        )

    merged = list(audit)
    if args.allow_unaudited and unaudited:
        print(f"WARNING: including {len(unaudited)} UN-AUDITED raw-LLM rows (--allow-unaudited). "
              f"These carry no human label — this weakens BM/ZH quality (doc 07 §4.3).")
        merged += unaudited

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        for e in merged:
            f.write(e.model_dump_json() + "\n")
    print(f"wrote {len(merged)} rows -> {args.out} (audited={len(audit)}, unaudited_included={len(merged) - len(audit)})")


if __name__ == "__main__":
    main()
