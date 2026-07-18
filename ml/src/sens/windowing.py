from __future__ import annotations


class SpanTooLongError(ValueError):
    """The marked span itself does not fit in max_len — drop/fail this instance, never clip a marker."""


def plan_window(open_idx: int, close_idx: int, seq_len: int, max_len: int) -> tuple[int, int]:
    """Token index window [start, end) of size <= max_len that KEEPS both marker tokens.

    open_idx / close_idx are the token positions of [E] and [/E]. If the whole sequence already
    fits, returns (0, seq_len). Otherwise centers a max_len window on the span midpoint and clamps
    to [0, seq_len). Raises SpanTooLongError if the marked span cannot fit.
    """
    if seq_len <= max_len:
        return 0, seq_len
    if close_idx - open_idx + 1 > max_len:
        raise SpanTooLongError(f"span spans {close_idx - open_idx + 1} tokens > max_len {max_len}")
    mid = (open_idx + close_idx) // 2
    start = mid - max_len // 2
    start = max(0, min(start, seq_len - max_len))
    end = start + max_len
    # guarantee both markers are inside after clamping
    if open_idx < start:
        start = open_idx
        end = start + max_len
    if close_idx >= end:
        end = close_idx + 1
        start = end - max_len
    return start, end
