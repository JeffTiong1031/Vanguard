from __future__ import annotations

from typing import Literal

from sens.schema import Example

Status = Literal["SHIP_CANDIDATE", "NOT_SHIPPED"]


def ship_status(
    examples: list[Example],
    mask_recall: float,
    missing_strata: list[str],
    predictions: list[str] | None = None,
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
