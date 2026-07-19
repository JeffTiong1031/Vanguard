"""Encode one marked instance the way the export contract says to — the single place that does it.

🔴 Why this module exists. `export-contract.md` tells eng: *"if the marked sequence exceeds max_len
(512), do NOT blindly truncate — take a span-centered window that keeps both markers... Eng must
reproduce this exact windowing or scores diverge from the reported eval."*

Until 2026-07-19 the eval scripts used `truncation=True`, which is blind truncation. The claim in
the contract was therefore false about our own numbers: an engineer following it would have
implemented something we had not. It never showed up because the exam's longest instance is 33
tokens and truncation never fired — a promise that costs nothing to keep is also a promise nobody
notices breaking.

`plan_window` had unit tests and zero production callers. This routes the eval through it so the
contract describes what was actually measured.

Import is torch-free at module level; the tokenizer is passed in.
"""
from __future__ import annotations

from sens.windowing import SpanTooLongError, plan_window


def encode_marked(tok, marked_text: str, max_len: int, open_token: str, close_token: str):
    """Tokenize a marked string, span-centering the window if it does not fit.

    Returns `(encoding, was_windowed)` where `encoding` has `input_ids` / `attention_mask` as
    lists of ints. Raises `SpanTooLongError` if the marked span alone exceeds `max_len` — the
    contract says such an instance is dropped or failed, never silently clipped past a marker.
    """
    ids = tok(marked_text, add_special_tokens=True)["input_ids"]
    if len(ids) <= max_len:
        return {"input_ids": ids, "attention_mask": [1] * len(ids)}, False

    open_id, close_id = tok.convert_tokens_to_ids([open_token, close_token])
    try:
        open_idx = ids.index(open_id)
        close_idx = len(ids) - 1 - ids[::-1].index(close_id)
    except ValueError as e:  # markers absent — a caller bug, not a length problem
        raise SpanTooLongError(
            f"marker not found in encoded sequence ({open_token}/{close_token}); "
            f"the instance was not marked before encoding"
        ) from e

    start, end = plan_window(open_idx, close_idx, len(ids), max_len)
    windowed = ids[start:end]
    return {"input_ids": windowed, "attention_mask": [1] * len(windowed)}, True
