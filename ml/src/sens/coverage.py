from __future__ import annotations

from collections import defaultdict

from sens.schema import Example

# Required strata for a shippable exam (Q6.2). tag-based cases are author-declared.
REQUIRED_TAGS = ("ambiguous_keep", "math_no_mask", "id_digit_line")


def coverage_report(rows: list[Example]) -> dict[str, bool]:
    def any_span(pred) -> bool:
        return any(pred(sp) for ex in rows for sp in ex.spans)

    langs = {ex.lang for ex in rows}
    surfaces: dict[str, set[str]] = defaultdict(set)
    for ex in rows:
        for sp in ex.spans:
            surfaces[sp.surface.lower()].add(sp.label)
    all_tags = {t for ex in rows for t in ex.tags}

    report = {
        "per_keep": any_span(lambda s: s.entity_type == "PER" and s.label == "KEEP"),
        "per_mask": any_span(lambda s: s.entity_type == "PER" and s.label == "MASK"),
        "org_keep": any_span(lambda s: s.entity_type == "ORG" and s.label == "KEEP"),
        "org_mask": any_span(lambda s: s.entity_type == "ORG" and s.label == "MASK"),
        "same_surface_opposite": any(len(v) > 1 for v in surfaces.values()),
        "lang_en": "en" in langs,
        "lang_bm": "bm" in langs,
        "lang_zh": "zh" in langs,
        "code_switch": "mixed" in langs,
    }
    for tag in REQUIRED_TAGS:
        report[tag] = tag in all_tags
    return report


def missing_strata(rows: list[Example]) -> list[str]:
    return [k for k, ok in coverage_report(rows).items() if not ok]


def stratum_counts(rows: list[Example]) -> dict[tuple[str, str, str], int]:
    counts: dict[tuple[str, str, str], int] = defaultdict(int)
    for ex in rows:
        for sp in ex.spans:
            counts[(ex.lang, sp.entity_type, sp.label)] += 1
    return dict(counts)
