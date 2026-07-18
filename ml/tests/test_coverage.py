from sens.schema import Example, Span
from sens.coverage import coverage_report, missing_strata, stratum_counts


def _ex(id, lang, spans, tags=None):
    return Example(id=id, text="t" * 50, lang=lang, spans=spans, provenance="human_simulated",
                   split="eval", tags=tags or [])


def _sp(s, e, etype, label, surface="x"):
    return Span(start=s, end=e, surface=surface, entity_type=etype, label=label)


def _full_exam():
    return [
        _ex("1", "en", [_sp(0, 8, "PER", "KEEP", "Einstein")]),
        _ex("2", "en", [_sp(0, 8, "PER", "MASK", "Einstein")]),   # same surface, opposite label
        _ex("3", "en", [_sp(0, 5, "ORG", "KEEP", "Apple")]),
        _ex("4", "bm", [_sp(0, 5, "ORG", "MASK", "AcmeX")]),
        _ex("5", "zh", [_sp(0, 2, "PER", "KEEP", "小明")], tags=["ambiguous_keep"]),
        _ex("6", "mixed", [], tags=["math_no_mask"]),
        _ex("7", "en", [_sp(0, 8, "PER", "KEEP", "Einstein")], tags=["id_digit_line"]),
    ]


def test_full_exam_covers_everything():
    assert missing_strata(_full_exam()) == []


def test_missing_reports_gaps():
    rows = [_ex("1", "en", [_sp(0, 8, "PER", "KEEP", "Einstein")])]
    miss = missing_strata(rows)
    assert "per_mask" in miss
    assert "lang_bm" in miss
    assert "math_no_mask" in miss


def test_stratum_counts():
    rows = [_ex("1", "en", [_sp(0, 8, "PER", "KEEP", "Einstein"), _sp(10, 15, "ORG", "MASK", "AcmeX")])]
    c = stratum_counts(rows)
    assert c[("en", "PER", "KEEP")] == 1
    assert c[("en", "ORG", "MASK")] == 1
