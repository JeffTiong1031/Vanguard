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
    status, reasons = ship_status([_row("human_simulated")], mask_recall=0.6, missing_strata=[])
    assert status == "SHIP_CANDIDATE"
    assert reasons == []


def test_real_dominant_is_candidate():
    status, reasons = ship_status([_row("real")], mask_recall=0.6, missing_strata=[])
    assert status == "SHIP_CANDIDATE"


def test_provenance_tie_fails_safe():
    # equal human_simulated vs llm_synthetic -> clean (1) <= synth (1) -> NOT_SHIPPED
    rows = [_row("human_simulated"), _row("llm_synthetic")]
    status, reasons = ship_status(rows, mask_recall=0.9, missing_strata=[])
    assert status == "NOT_SHIPPED"
    assert any("clean<=synthetic" in r for r in reasons)
