from __future__ import annotations

from typing import Literal

from sens.schema import Example

Status = Literal["SHIP_CANDIDATE", "NOT_SHIPPED"]


def ship_status(
    examples: list[Example],
    mask_recall: float,
    missing_strata: list[str],
    predictions: list[str] | None = None,
    integrated_mask_recall: float | None = None,
) -> tuple[Status, list[str]]:
    """`predictions` is optional so existing positional callers keep working.

    Pass it whenever you have it: the `mask_recall <= 0` check below catches an always-KEEP
    model, but it is blind to its mirror. An always-MASK model scores recall 1.0 and reaches
    SHIP_CANDIDATE — while being the worst outcome this product can ship, since precision is
    quasi-contractual (ADR 0001) and every span becomes a ticket the admin eats. ADR 0021 was
    written assuming KEEP dominates; this corpus is MASK-majority, so the degenerate direction
    flipped and the original check no longer covers it. Observed 2026-07-18.

    The test is structural — the model emitted one class for every instance — so it invents no
    threshold. Numeric floors stay a human decision.

    `integrated_mask_recall` is the composed NER→classifier number (Task 18). **Without it this
    function cannot return SHIP_CANDIDATE**, because `mask_recall` alone is measured on gold
    spans and therefore assumes a perfect NER. Measured 2026-07-19: the classifier scored 0.996
    on gold spans while the integrated system reached 0.928, and before span repair and the org
    dictionary the same classifier sat behind an integrated 0.650. Certifying a ship on the
    upper bound would be this gate answering a narrower question than the one it is trusted
    with — the defect it already had twice.

    Still no numeric floor: the gate requires the integrated measurement to EXIST and to be
    non-trivial. What counts as good enough stays a human decision (ADR 0001's operating point
    belongs to the admin).
    """
    reasons: list[str] = []
    eval_rows = [e for e in examples if e.split == "eval"]
    if not eval_rows:
        return "NOT_SHIPPED", ["no eval split present"]

    synth = sum(1 for e in eval_rows if e.provenance == "llm_synthetic")
    clean = len(eval_rows) - synth  # human_simulated + real
    if clean <= synth:  # tie or synthetic-majority -> fail-safe: NOT a ship signal
        reasons.append(
            "eval llm_synthetic is not human_simulated/real-dominant (clean<=synthetic) — not a ship signal "
            "(ADR 0015 / doc 07 §5)"
        )
    if mask_recall <= 0.0:
        reasons.append("MASK recall is 0 — always-KEEP / trivial model (NOT_SHIPPED even at zero false alarms)")
    if integrated_mask_recall is None:
        reasons.append(
            "no integrated (composed NER→classifier) measurement supplied — gold-span recall "
            "assumes a perfect NER and is an UPPER BOUND, so it cannot certify a ship (Task 18)"
        )
    elif integrated_mask_recall <= 0.0:
        reasons.append(
            "integrated MASK recall is 0 — nothing reaches the classifier usably, whatever the "
            "gold-span score says"
        )
    if predictions and len(set(predictions)) == 1:
        only = predictions[0]
        reasons.append(
            f"model predicted a single class ({only}) for all {len(predictions)} instances — "
            f"trivial model, NOT_SHIPPED in either direction"
        )
    if missing_strata:
        reasons.append(f"eval missing required strata: {missing_strata}")

    if reasons:
        return "NOT_SHIPPED", reasons
    return "SHIP_CANDIDATE", []
