"""encode_marked must window rather than truncate — tested with a fake tokenizer, no torch.

A real tokenizer would drag in transformers and the CPU-only CI (ADR 0023) has none, so the
tokenizer contract is faked here: `tok(text)["input_ids"]` and `convert_tokens_to_ids`.
"""
import pytest

from sens.encoding import encode_marked
from sens.windowing import SpanTooLongError

OPEN, CLOSE = "[E]", "[/E]"
OPEN_ID, CLOSE_ID = 900, 901


class FakeTok:
    """Whitespace tokenizer: each word is one id; markers get their own reserved ids."""

    def __call__(self, text, add_special_tokens=True):
        ids = []
        for w in text.split():
            if w == OPEN:
                ids.append(OPEN_ID)
            elif w == CLOSE:
                ids.append(CLOSE_ID)
            else:
                ids.append(1)
        return {"input_ids": ids}

    def convert_tokens_to_ids(self, tokens):
        return [{OPEN: OPEN_ID, CLOSE: CLOSE_ID}[t] for t in tokens]


def _marked(before: int, span: int, after: int) -> str:
    return " ".join(["w"] * before + [OPEN] + ["s"] * span + [CLOSE] + ["w"] * after)


def test_short_sequence_is_untouched():
    enc, windowed = encode_marked(FakeTok(), _marked(3, 2, 3), max_len=64,
                                  open_token=OPEN, close_token=CLOSE)
    assert windowed is False
    assert len(enc["input_ids"]) == 10
    assert enc["attention_mask"] == [1] * 10


def test_long_sequence_is_windowed_not_truncated():
    # span sits far past max_len; blind truncation would drop BOTH markers
    text = _marked(before=200, span=3, after=200)
    enc, windowed = encode_marked(FakeTok(), text, max_len=64,
                                  open_token=OPEN, close_token=CLOSE)
    assert windowed is True
    assert len(enc["input_ids"]) == 64
    assert OPEN_ID in enc["input_ids"], "opening marker was cut — this is the bug windowing exists for"
    assert CLOSE_ID in enc["input_ids"], "closing marker was cut"


def test_span_near_the_end_keeps_both_markers():
    enc, _ = encode_marked(FakeTok(), _marked(300, 2, 1), max_len=64,
                           open_token=OPEN, close_token=CLOSE)
    assert OPEN_ID in enc["input_ids"] and CLOSE_ID in enc["input_ids"]


def test_span_near_the_start_keeps_both_markers():
    enc, _ = encode_marked(FakeTok(), _marked(0, 2, 300), max_len=64,
                           open_token=OPEN, close_token=CLOSE)
    assert OPEN_ID in enc["input_ids"] and CLOSE_ID in enc["input_ids"]


def test_span_longer_than_window_is_refused_not_clipped():
    # the contract: drop or fail the instance, never clip past a marker
    with pytest.raises(SpanTooLongError):
        encode_marked(FakeTok(), _marked(10, 100, 10), max_len=64,
                      open_token=OPEN, close_token=CLOSE)


def test_unmarked_input_is_a_caller_bug():
    long_unmarked = " ".join(["w"] * 300)
    with pytest.raises(SpanTooLongError, match="not marked"):
        encode_marked(FakeTok(), long_unmarked, max_len=64,
                      open_token=OPEN, close_token=CLOSE)
