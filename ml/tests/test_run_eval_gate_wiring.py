"""The gate wiring in build_report, tested without torch or a checkpoint.

The point is CLAUDE.md ledger #11: a verdict is a claim about its INPUT. These tests feed
build_report predictions it did not produce, so what is under test is the wiring — does a
degenerate prediction list actually reach the gate and change the verdict.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from run_eval import build_report, per_stratum_errors  # noqa: E402

from sens.schema import Example, Span  # noqa: E402


def _exam():
    """Minimal coverage-complete exam so missing_strata does not mask the checks."""
    def row(rid, text, lang, marks, tags=()):
        spans = []
        for surface, etype, label in marks:
            s = text.index(surface)
            spans.append(Span(start=s, end=s + len(surface), surface=surface,
                              entity_type=etype, label=label))
        return Example(id=rid, text=text, lang=lang, spans=spans,
                       provenance="human_simulated", split="eval", tags=list(tags))

    return [
        row("e1", "Explain Einstein's theory.", "en", [("Einstein", "PER", "KEEP")]),
        row("e2", "Einstein from accounting owes us.", "en", [("Einstein", "PER", "MASK")]),
        row("e3", "Summarise Apple earnings.", "en", [("Apple", "ORG", "KEEP")]),
        row("e4", "Chase Apple for the invoice.", "en", [("Apple", "ORG", "MASK")]),
        row("e5", "Sila jelaskan dasar Anwar.", "bm", [("Anwar", "PER", "KEEP")]),
        row("e6", "李白的诗歌流传千古。", "zh", [("李白", "PER", "KEEP")]),
        row("e7", "Email Mr. Tan about it.", "mixed", [("Mr. Tan", "PER", "MASK")]),
        row("e8", "Alice", "en", [("Alice", "PER", "KEEP")], tags=("ambiguous_keep",)),
        row("e9", "1 + 1 = 2 in 2024.", "en", [], tags=("math_no_mask",)),
        row("e10", "Update Mr. Lee, TIN 9384729103.", "en",
            [("Mr. Lee", "PER", "MASK")], tags=("id_digit_line",)),
    ]


def _gold(rows):
    return [sp.label for ex in rows for sp in ex.spans]


def test_always_mask_is_not_shipped():
    rows = _exam()
    gold = _gold(rows)
    pred = ["MASK"] * len(gold)
    rep = build_report(rows, gold, pred, entities={})
    assert rep["mask_recall"] == 1.0, "always-MASK trivially attains perfect recall"
    assert rep["ship_status"] == "NOT_SHIPPED"
    assert any("single class" in r for r in rep["reasons"])


def test_always_keep_is_not_shipped():
    rows = _exam()
    gold = _gold(rows)
    pred = ["KEEP"] * len(gold)
    rep = build_report(rows, gold, pred, entities={})
    assert rep["ship_status"] == "NOT_SHIPPED"


def test_perfect_predictions_are_a_candidate():
    rows = _exam()
    gold = _gold(rows)
    rep = build_report(rows, gold, list(gold), entities={})
    assert rep["mask_precision"] == 1.0
    assert rep["mask_recall"] == 1.0
    assert rep["ship_status"] == "SHIP_CANDIDATE"
    assert rep["reasons"] == []


def test_synthetic_exam_never_ships_however_good():
    rows = _exam()
    for ex in rows:
        ex.provenance = "llm_synthetic"
    gold = _gold(rows)
    rep = build_report(rows, gold, list(gold), entities={})
    assert rep["ship_status"] == "NOT_SHIPPED", "ADR 0021: synthetic is never a ship signal"


def test_report_carries_the_gold_span_caveat():
    rows = _exam()
    gold = _gold(rows)
    rep = build_report(rows, gold, list(gold), entities={})
    assert "upper bound" in rep["caveat"].lower()
    assert "does NOT discharge" in rep["authorship_note"]


def test_full_mention_coverage_counts_entities_not_spans():
    rows = _exam()
    gold = _gold(rows)
    # one entity fully caught, one only half caught
    entities = {"a": [True, True], "b": [True, False]}
    rep = build_report(rows, gold, list(gold), entities=entities)
    assert rep["full_mention_coverage"] == pytest.approx(0.5)


def test_per_stratum_errors_locates_mistakes():
    rows = _exam()
    gold = _gold(rows)
    pred = list(gold)
    pred[0] = "MASK"  # flip the first span (en,PER,KEEP)
    strata, titled = per_stratum_errors(rows, gold, pred)
    assert strata["en,PER,KEEP"]["wrong"] == 1
    assert strata["en,PER,MASK"]["wrong"] == 0


def test_titled_keep_probe_is_counted():
    rows = _exam()
    rows.append(Example(
        id="e11", text="Tan Sri P. Ramlee is admired.", lang="en",
        spans=[Span(start=0, end=17, surface="Tan Sri P. Ramlee",
                    entity_type="PER", label="KEEP")],
        provenance="human_simulated", split="eval"))
    gold = _gold(rows)
    pred = list(gold)
    pred[-1] = "MASK"  # the shortcut failure: titled person wrongly masked
    _strata, titled = per_stratum_errors(rows, gold, pred)
    assert titled["n"] == 1
    assert titled["wrong"] == 1
