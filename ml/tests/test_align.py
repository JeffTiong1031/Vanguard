from sens.schema import Span
from sens.align import align_spans, ner_miss_rate


def _g(s, e, label):
    return Span(start=s, end=e, surface="x" * (e - s), entity_type="PER", label=label)


def test_exact_match():
    gold = [_g(0, 5, "MASK")]
    res = align_spans(gold, [(0, 5)])
    assert res.matched == [((0, 5), "MASK")]
    assert res.ner_misses == [] and res.ner_extras == []


def test_partial_overlap_matches_best():
    gold = [_g(0, 10, "MASK")]
    res = align_spans(gold, [(2, 8)])   # noisy boundary, still overlaps
    assert res.matched == [((2, 8), "MASK")]


def test_miss_and_extra():
    gold = [_g(0, 5, "MASK"), _g(20, 25, "KEEP")]
    res = align_spans(gold, [(0, 5), (40, 45)])  # (20,25) missed; (40,45) is an extra
    assert res.matched == [((0, 5), "MASK")]
    assert [(s.start, s.end) for s in res.ner_misses] == [(20, 25)]
    assert res.ner_extras == [(40, 45)]
    assert ner_miss_rate(res, gold) == 0.5
