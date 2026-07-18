from __future__ import annotations

from dataclasses import dataclass, field

from sens.schema import Span


@dataclass
class AlignResult:
    matched: list[tuple[tuple[int, int], str]] = field(default_factory=list)
    ner_misses: list[Span] = field(default_factory=list)
    ner_extras: list[tuple[int, int]] = field(default_factory=list)


def _overlap(a: tuple[int, int], b: tuple[int, int]) -> int:
    return max(0, min(a[1], b[1]) - max(a[0], b[0]))


def align_spans(gold: list[Span], proposed: list[tuple[int, int]]) -> AlignResult:
    res = AlignResult()
    matched_gold: set[int] = set()
    for p in proposed:
        best_i, best_ov = -1, 0
        for i, g in enumerate(gold):
            ov = _overlap(p, (g.start, g.end))
            if ov > best_ov:
                best_i, best_ov = i, ov
        if best_i == -1:
            res.ner_extras.append(p)
        else:
            res.matched.append((p, gold[best_i].label))
            matched_gold.add(best_i)
    res.ner_misses = [g for i, g in enumerate(gold) if i not in matched_gold]
    return res


def ner_miss_rate(result: AlignResult, gold: list[Span]) -> float:
    if not gold:
        return 0.0
    return len(result.ner_misses) / len(gold)
