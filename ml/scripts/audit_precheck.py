"""Pre-merge check on a human-audited file, and a breakdown of WHY rows disagree.

Two gaps this closes, both in the direction of a silent wrong answer:

1. `merge_audit.py` emits the AUDIT file verbatim, and validates only schema + offsets.
   A reviewer who edits `text` (or `lang`, `id`, `entity_type`) still passes validation —
   the merged training set then differs from the draft in ways nobody reported.
   Everything except `spans` is supposed to be immutable during audit. Check it.

2. `disagreement_rate` compares the SET of (start, end, label). A title fix that the rubric
   REQUIRES (`Rahman` -> `Encik Rahman`, doc 04 4.3) moves the offsets, so it counts as a
   disagreement identically to a MASK/KEEP flip. One number, three very different events.
   Report them apart: a boundary-fix rate is audit quality, a label-flip rate is draft quality.

Read-only. Writes nothing.
"""
from __future__ import annotations

import argparse
import re
from collections import defaultdict
from pathlib import Path

from sens.schema import Example
from sens.validate_jsonl import load_jsonl, validate_path

# L1 owns identifier digits (label-schema.md "Out of scope"). A classified span must never
# cover one. Deliberately loose: any run of 6+ digits, ignoring - and spaces.
_DIGITY = re.compile(r"[\d][\d\s-]{5,}")

IMMUTABLE = ("text", "lang", "provenance", "split", "source")


def _spanset(ex: Example) -> set[tuple[int, int, str]]:
    return {(s.start, s.end, s.label) for s in ex.spans}


def _labels_by_offset(ex: Example) -> dict[tuple[int, int], str]:
    return {(s.start, s.end): s.label for s in ex.spans}


def check_immutables(draft: list[Example], audit: list[Example]) -> list[str]:
    by_d = {e.id: e for e in draft}
    errs: list[str] = []
    for a in audit:
        d = by_d.get(a.id)
        if d is None:
            errs.append(f"{a.id}: id not present in draft (renamed or invented row)")
            continue
        for field in IMMUTABLE:
            dv, av = getattr(d, field), getattr(a, field)
            if dv != av:
                errs.append(f"{a.id}: {field} was edited during audit ({dv!r} -> {av!r})")
    return errs


def check_digit_spans(audit: list[Example]) -> list[str]:
    errs: list[str] = []
    for e in audit:
        for s in e.spans:
            if _DIGITY.search(s.surface):
                errs.append(f"{e.id}: span {s.surface!r} looks like an identifier - L1 owns these, never span them")
    return errs


def coverage(draft: list[Example], audit: list[Example]) -> tuple[list[str], list[str]]:
    d_ids = {e.id for e in draft}
    a_ids = {e.id for e in audit}
    return sorted(d_ids - a_ids), sorted(a_ids - d_ids)


def breakdown(draft: list[Example], audit: list[Example]) -> dict:
    by_d = {e.id: e for e in draft}
    ids = sorted({e.id for e in audit} & set(by_d))
    kinds: dict[str, list[str]] = defaultdict(list)
    per_lang: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for i in ids:
        d, a = by_d[i], next(e for e in audit if e.id == i)
        lang = d.lang
        per_lang[lang]["total"] += 1
        if _spanset(d) == _spanset(a):
            continue
        per_lang[lang]["any"] += 1

        d_lab, a_lab = _labels_by_offset(d), _labels_by_offset(a)
        shared = set(d_lab) & set(a_lab)
        flipped = {o for o in shared if d_lab[o] != a_lab[o]}
        added = set(a_lab) - set(d_lab)
        removed = set(d_lab) - set(a_lab)

        if flipped:
            kinds["label_flip"].append(i)
            per_lang[lang]["label_flip"] += 1
        # offsets moved but the multiset of labels is unchanged -> boundary/title fix
        if (added or removed) and sorted(d_lab.values()) == sorted(a_lab.values()):
            kinds["boundary_fix"].append(i)
            per_lang[lang]["boundary_fix"] += 1
        elif added and not flipped and sorted(d_lab.values()) != sorted(a_lab.values()):
            kinds["span_added_or_removed"].append(i)
            per_lang[lang]["span_added_or_removed"] += 1
        elif removed and not flipped and sorted(d_lab.values()) != sorted(a_lab.values()):
            kinds["span_added_or_removed"].append(i)
            per_lang[lang]["span_added_or_removed"] += 1
    return {"kinds": kinds, "per_lang": per_lang, "n": len(ids)}


def main() -> None:
    ap = argparse.ArgumentParser(description="Pre-merge audit check + disagreement breakdown")
    ap.add_argument("--draft", type=Path, required=True)
    ap.add_argument("--audit", type=Path, required=True)
    ap.add_argument("--show", type=int, default=8, help="how many example ids to print per category")
    args = ap.parse_args()

    hard = False
    for p in (args.draft, args.audit):
        errs = validate_path(p)
        if errs:
            hard = True
            print(f"SCHEMA/OFFSET ERRORS in {p.name}:")
            for e in errs[:20]:
                print("  " + e)
            if len(errs) > 20:
                print(f"  ... and {len(errs) - 20} more")
    if hard:
        raise SystemExit("fix schema errors before merging")

    draft, audit = load_jsonl(args.draft), load_jsonl(args.audit)

    missing, extra = coverage(draft, audit)
    print(f"rows: draft={len(draft)} audit={len(audit)}")
    if missing:
        print(f"  NOT AUDITED ({len(missing)}): {missing[:args.show]}{' ...' if len(missing) > args.show else ''}")
        print("  -> merge_audit.py will FAIL on these by design. Audit them or get founder sign-off.")
    if extra:
        print(f"  IN AUDIT BUT NOT DRAFT ({len(extra)}): {extra[:args.show]}")

    imm = check_immutables(draft, audit)
    print(f"\nimmutable-field edits: {len(imm)}")
    for e in imm[:args.show]:
        print("  " + e)
    if imm:
        print("  -> these change the TRAINING TEXT silently. Revert them before merging.")

    dig = check_digit_spans(audit)
    print(f"\nidentifier-looking spans: {len(dig)}")
    for e in dig[:args.show]:
        print("  " + e)

    b = breakdown(draft, audit)
    print(f"\ndisagreement breakdown over {b['n']} shared rows:")
    for kind in ("label_flip", "boundary_fix", "span_added_or_removed"):
        rows = b["kinds"].get(kind, [])
        rate = len(rows) / b["n"] if b["n"] else 0.0
        print(f"  {kind:24s} {len(rows):4d}  ({rate:.3f})  e.g. {rows[:args.show]}")
    print("\n  per-lang (total / any-disagree / label_flip / boundary_fix):")
    for lang, c in sorted(b["per_lang"].items()):
        print(f"    {lang:6s} {c['total']:4d} / {c['any']:4d} / {c['label_flip']:4d} / {c['boundary_fix']:4d}")
    print("\n  label_flip  = the LLM draft was wrong about MASK/KEEP  -> draft quality")
    print("  boundary_fix = offsets moved, labels same (e.g. title pulled into the span) -> rubric compliance")
    print("  merge_audit.py's single number is all three added together. No cutoff is defined; the")
    print("  founder decides. Bring these three rows-of-numbers, not the one.")


if __name__ == "__main__":
    main()
