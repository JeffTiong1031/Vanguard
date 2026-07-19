"""Convert a human-written exam source file into schema JSONL, computing offsets.

The AUTHOR writes the sentences and decides every label. This script only does arithmetic:
it strips the markers and computes start/end. That is why `provenance: human_simulated`
stays truthful — no content is generated here.

Source format, one question per line:

    lang | text with [span](TYPE:LABEL) markers
    lang #tag #tag | text ...

    en             | Explain [Einstein](PER:KEEP)'s theory of relativity.
    bm             | Tolong ingatkan [Encik Rahman](PER:MASK) pasal mesyuarat.
    zh             | [李白先生](PER:MASK)，您的退款已经处理完毕。
    mixed          | Email [Mr. Tan](PER:MASK) about the [Petronas](ORG:MASK) tender.
    en #math_no_mask | The formula is 1 + 1 = 2 and the year is 2024.

- lang is one of: en, bm, zh, mixed
- TYPE is PER or ORG (LOC is out of scope — label-schema.md)
- LABEL is MASK or KEEP
- a line with no [...] markers produces a row with zero spans (that is valid and required
  for math_no_mask rows)
- blank lines and lines starting with # are ignored
- put the TITLE INSIDE the marker when masking a person: [Encik Rahman](PER:MASK)

Usage:
    python scripts/author_exam.py --in data/eval_simulated/exam_source.txt \
        --out data/eval_simulated/exam.jsonl
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

MARKER = re.compile(r"\[([^\[\]]+)\]\(([A-Za-z]+):([A-Za-z]+)\)")
LANGS = {"en", "bm", "zh", "mixed"}
TYPES = {"PER", "ORG"}
LABELS = {"MASK", "KEEP"}


def parse_line(line: str, lineno: int) -> tuple[str, list[str], str, list[dict]]:
    if "|" not in line:
        raise ValueError(f"line {lineno}: missing '|' separator between lang and text")
    head, text_raw = line.split("|", 1)
    head, text_raw = head.strip(), text_raw.strip()

    parts = head.split()
    if not parts:
        raise ValueError(f"line {lineno}: missing lang")
    lang, tags = parts[0], [p.lstrip("#") for p in parts[1:]]
    if lang not in LANGS:
        raise ValueError(f"line {lineno}: lang {lang!r} not in {sorted(LANGS)}")
    for p in parts[1:]:
        if not p.startswith("#"):
            raise ValueError(f"line {lineno}: tag {p!r} must start with '#'")

    # Walk the raw text, emitting clean text and computing offsets as we strip markers.
    text, spans, pos = "", [], 0
    for m in MARKER.finditer(text_raw):
        text += text_raw[pos:m.start()]
        surface, etype, label = m.group(1), m.group(2).upper(), m.group(3).upper()
        if etype not in TYPES:
            raise ValueError(f"line {lineno}: entity_type {etype!r} not in {sorted(TYPES)} "
                             f"(LOC is out of scope)")
        if label not in LABELS:
            raise ValueError(f"line {lineno}: label {label!r} not in {sorted(LABELS)}")
        start = len(text)
        text += surface
        spans.append({"start": start, "end": len(text), "surface": surface,
                      "entity_type": etype, "label": label})
        pos = m.end()
    text += text_raw[pos:]

    if not text.strip():
        raise ValueError(f"line {lineno}: empty text")
    # Unbalanced markers are a silent-corruption risk: catch a stray bracket the regex skipped.
    leftover = text.count("[") + text.count("]")
    if leftover:
        raise ValueError(f"line {lineno}: stray '[' or ']' in text after parsing — "
                         f"check the marker syntax [surface](TYPE:LABEL)")
    return lang, tags, text, spans


def main() -> None:
    ap = argparse.ArgumentParser(description="Author-friendly exam source -> schema JSONL")
    ap.add_argument("--in", dest="inp", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--prefix", default="exam", help="id prefix (default: exam)")
    ap.add_argument("--provenance", default="human_simulated",
                    choices=["human_simulated", "real"],
                    help="human_simulated unless these are REAL prompts (ADR 0015 re-arms counsel)")
    ap.add_argument("--split", default="eval", choices=["eval", "train", "dev"])
    ap.add_argument("--source", default="team_author")
    args = ap.parse_args()

    rows, errors = [], []
    for lineno, raw in enumerate(args.inp.read_text(encoding="utf-8").splitlines(), start=1):
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        try:
            lang, tags, text, spans = parse_line(s, lineno)
        except ValueError as e:
            errors.append(str(e))
            continue
        rows.append({"id": f"{args.prefix}-{len(rows) + 1:03d}", "text": text, "lang": lang,
                     "spans": spans, "provenance": args.provenance, "split": args.split,
                     "source": args.source, "tags": tags})

    if errors:
        print("PARSE ERRORS — nothing written:")
        for e in errors:
            print("  " + e)
        sys.exit(1)

    if not rows:
        print("no questions found (blank file, or every line was a # comment)")
        sys.exit(1)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    n_spans = sum(len(r["spans"]) for r in rows)
    print(f"wrote {len(rows)} questions ({n_spans} spans) -> {args.out}")
    print(f"now run: python scripts/check_eval_coverage.py {args.out}")


if __name__ == "__main__":
    main()
