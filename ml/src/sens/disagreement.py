from __future__ import annotations

from collections import defaultdict

from sens.schema import Example


def span_label_set(ex: Example) -> set[tuple[int, int, str]]:
    return {(s.start, s.end, s.label) for s in ex.spans}


def _overlap_ids(a: list[Example], b: list[Example]) -> tuple[dict, dict, list[str]]:
    by_a = {e.id: e for e in a}
    by_b = {e.id: e for e in b}
    ids = sorted(set(by_a) & set(by_b))
    if not ids:
        raise ValueError("no overlapping ids")
    return by_a, by_b, ids


def disagreement_rate(a: list[Example], b: list[Example]) -> float:
    by_a, by_b, ids = _overlap_ids(a, b)
    disagree = sum(1 for i in ids if span_label_set(by_a[i]) != span_label_set(by_b[i]))
    return disagree / len(ids)


def disagreement_by_lang(a: list[Example], b: list[Example]) -> dict[str, float]:
    by_a, by_b, ids = _overlap_ids(a, b)
    total: dict[str, int] = defaultdict(int)
    disagree: dict[str, int] = defaultdict(int)
    for i in ids:
        lang = by_a[i].lang
        total[lang] += 1
        if span_label_set(by_a[i]) != span_label_set(by_b[i]):
            disagree[lang] += 1
    return {lang: disagree[lang] / total[lang] for lang in total}
