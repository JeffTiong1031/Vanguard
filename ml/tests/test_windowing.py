import pytest
from sens.windowing import plan_window, SpanTooLongError


def test_no_window_when_it_fits():
    # both markers within max_len -> full [0, seq_len)
    assert plan_window(open_idx=3, close_idx=7, seq_len=20, max_len=32) == (0, 20)


def test_centers_on_span_when_too_long():
    # markers at 100..104, seq_len 300, max_len 32 -> window includes both, centered
    start, end = plan_window(open_idx=100, close_idx=104, seq_len=300, max_len=32)
    assert end - start == 32
    assert start <= 100 and 104 < end          # both markers inside
    assert start >= 0 and end <= 300


def test_clamps_at_right_edge():
    start, end = plan_window(open_idx=295, close_idx=299, seq_len=300, max_len=32)
    assert end == 300 and end - start == 32
    assert start <= 295 and 299 < end


def test_span_longer_than_window_raises():
    with pytest.raises(SpanTooLongError):
        plan_window(open_idx=0, close_idx=40, seq_len=300, max_len=32)
