from sens.schema import Example, Span
from sens.eval_gate import ship_status


def _row(provenance, split="eval"):
    return Example(id="1", text="t", lang="en", provenance=provenance, split=split,
                   spans=[Span(start=0, end=1, surface="t", entity_type="PER", label="MASK")])


def test_no_eval_split_not_shipped():
    status, reasons = ship_status([_row("human_simulated", split="train")], mask_recall=0.9, missing_strata=[])
    assert status == "NOT_SHIPPED"
    assert any("no eval" in r for r in reasons)


def test_synthetic_eval_not_shipped():
    status, reasons = ship_status([_row("llm_synthetic")], mask_recall=0.9, missing_strata=[])
    assert status == "NOT_SHIPPED"
    assert any("llm_synthetic" in r for r in reasons)


def test_always_keep_not_shipped():
    status, reasons = ship_status([_row("human_simulated")], mask_recall=0.0, missing_strata=[])
    assert status == "NOT_SHIPPED"
    assert any("recall" in r for r in reasons)


def test_missing_strata_not_shipped():
    status, reasons = ship_status([_row("human_simulated")], mask_recall=0.9, missing_strata=["per_mask"])
    assert status == "NOT_SHIPPED"
    assert any("strata" in r for r in reasons)


def test_human_simulated_clean_is_candidate():
    status, reasons = ship_status([_row("human_simulated")], mask_recall=0.6, missing_strata=[],
                                  integrated_mask_recall=0.55)
    assert status == "SHIP_CANDIDATE"
    assert reasons == []


def test_real_dominant_is_candidate():
    status, reasons = ship_status([_row("real")], mask_recall=0.6, missing_strata=[],
                                  integrated_mask_recall=0.55)
    assert status == "SHIP_CANDIDATE"


def test_always_mask_not_shipped():
    # The mirror of always-KEEP, and the one the recall check cannot see: a model that
    # masks EVERYTHING has recall 1.0 and sails through. It is also the worst outcome for
    # this product — precision is quasi-contractual (ADR 0001) and every span is a false
    # alarm. Observed for real on 2026-07-18 (dev precision 0.4474 = the MASK base rate).
    status, reasons = ship_status(
        [_row("human_simulated")], mask_recall=1.0, missing_strata=[],
        predictions=["MASK"] * 20,
    )
    assert status == "NOT_SHIPPED"
    assert any("single class" in r for r in reasons)


def test_always_keep_caught_by_constant_check_too():
    status, reasons = ship_status(
        [_row("human_simulated")], mask_recall=0.0, missing_strata=[],
        predictions=["KEEP"] * 20,
    )
    assert status == "NOT_SHIPPED"
    assert any("single class" in r for r in reasons)


def test_mixed_predictions_still_candidate():
    status, reasons = ship_status(
        [_row("human_simulated")], mask_recall=0.6, missing_strata=[],
        predictions=["MASK"] * 12 + ["KEEP"] * 8, integrated_mask_recall=0.55,
    )
    assert status == "SHIP_CANDIDATE"
    assert reasons == []


def test_predictions_optional_preserves_existing_signature():
    # Tasks 12/17/18 call ship_status positionally without predictions; the call must still
    # WORK. Its verdict is now NOT_SHIPPED, deliberately: a positional gold-span-only call
    # cannot certify a ship, and that is exactly what the integrated requirement is for.
    status, reasons = ship_status([_row("human_simulated")], 0.6, [])
    assert status == "NOT_SHIPPED"
    assert any("integrated" in r for r in reasons)


def test_provenance_tie_fails_safe():
    # equal human_simulated vs llm_synthetic -> clean (1) <= synth (1) -> NOT_SHIPPED
    rows = [_row("human_simulated"), _row("llm_synthetic")]
    status, reasons = ship_status(rows, mask_recall=0.9, missing_strata=[])
    assert status == "NOT_SHIPPED"
    assert any("clean<=synthetic" in r for r in reasons)


def test_gold_span_only_cannot_ship():
    # The gold-span number assumes perfect NER, so it is an UPPER BOUND. Measured
    # 2026-07-19: classifier recall 0.996 on gold spans, integrated 0.928 once the NER's
    # real coverage is included. A gate that certifies on the upper bound is answering a
    # narrower question than the one it is trusted with.
    status, reasons = ship_status([_row("human_simulated")], mask_recall=0.99, missing_strata=[])
    assert status == "NOT_SHIPPED"
    assert any("integrated" in r for r in reasons)


def test_integrated_measurement_allows_a_candidate():
    status, reasons = ship_status(
        [_row("human_simulated")], mask_recall=0.99, missing_strata=[],
        integrated_mask_recall=0.93,
    )
    assert status == "SHIP_CANDIDATE"
    assert reasons == []


def test_integrated_zero_is_not_shipped():
    status, reasons = ship_status(
        [_row("human_simulated")], mask_recall=0.99, missing_strata=[],
        integrated_mask_recall=0.0,
    )
    assert status == "NOT_SHIPPED"
    assert any("integrated" in r for r in reasons)
