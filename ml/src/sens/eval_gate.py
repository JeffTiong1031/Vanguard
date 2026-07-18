from __future__ import annotations

from typing import Literal

from sens.schema import Example

Status = Literal["SHIP_CANDIDATE", "NOT_SHIPPED"]


def ship_status(
    examples: list[Example],
    mask_recall: float,
    missing_strata: list[str],
) -> tuple[Status, list[str]]:
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
    if missing_strata:
        reasons.append(f"eval missing required strata: {missing_strata}")

    if reasons:
        return "NOT_SHIPPED", reasons
    return "SHIP_CANDIDATE", []
