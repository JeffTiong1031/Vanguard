# ml/scripts/generate_llm_draft.py
"""Optional: write LLM-produced JSONL to data/llm_draft/ after validating it.

This does NOT call any API — paste/redirect the LLM output (produced with prompts/v1_...md)
into a file and pass it here. It only validates + tags provenance, so drafts enter the
pipeline in schema form. Colab is fine for llm_synthetic (Global Constraints).
"""
from __future__ import annotations

import argparse
from pathlib import Path

from sens.residency import assert_upload_allowed
from sens.validate_jsonl import load_jsonl, validate_path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", type=Path, required=True, help="raw LLM JSONL (schema-shaped)")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    errs = validate_path(args.inp)
    if errs:
        raise SystemExit("draft failed validation:\n" + "\n".join(errs))
    rows = load_jsonl(args.inp)
    if any(r.provenance != "llm_synthetic" for r in rows):
        raise SystemExit("draft rows must be provenance=llm_synthetic")
    assert_upload_allowed(rows, target="colab")  # sanity: synthetic is Colab-safe
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(r.model_dump_json() + "\n")
    print(f"validated {len(rows)} llm_synthetic rows -> {args.out}")


if __name__ == "__main__":
    main()
