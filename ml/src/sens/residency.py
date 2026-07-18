from __future__ import annotations

from sens.schema import Example

_LOCAL_TARGETS = {"local_my", "my_region"}


def assert_no_eval_in_train(rows: list[Example]) -> None:
    """The held-out exam must never enter a training/dev load."""
    leaked = [e.id for e in rows if e.split == "eval"]
    if leaked:
        raise ValueError(
            f"eval-split rows leaked into a training/dev set: {leaked[:5]} "
            f"(+{max(0, len(leaked) - 5)} more). Never train on the exam."
        )


def assert_upload_allowed(rows: list[Example], target: str) -> None:
    """real-provenance data must stay on local MY / MY-region infra (ADR 0015)."""
    if target not in _LOCAL_TARGETS | {"colab"}:
        raise ValueError(f"unknown upload target {target!r}")
    if target in _LOCAL_TARGETS:
        return
    real = [e.id for e in rows if e.provenance == "real"]
    if real:
        raise ValueError(
            f"real-provenance rows {real[:5]} must stay on local MY / MY-region infra; "
            f"refusing upload to {target!r} (ADR 0015 / U25)."
        )


def counsel_gate_required(rows: list[Example]) -> bool:
    """The conditional ADR 0015 counsel STOP: any real personal prompt re-arms it."""
    return any(e.provenance == "real" for e in rows)
