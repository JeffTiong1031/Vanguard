"""Tests for span_repair — the real NER failures it was built from, not invented cases.

Every fragment case below was produced by a stock NER over the exam on 2026-07-19.
"""
import pytest

from sens.span_repair import coverage, expand_titles, merge_spans, repair_spans


class TestMerge:
    def test_empty(self):
        assert merge_spans([]) == []

    def test_overlapping_are_unioned(self):
        # 阿里巴巴 was proposed as 阿 (0,1) and 阿里巴巴 (0,4)
        assert merge_spans([(0, 1), (0, 4)]) == [(0, 4)]

    def test_adjacent_touching_are_joined(self):
        assert merge_spans([(0, 3), (3, 6)]) == [(0, 6)]

    def test_disjoint_are_kept_apart(self):
        assert merge_spans([(0, 3), (10, 14)]) == [(0, 3), (10, 14)]

    def test_gap_zero_does_not_bridge(self):
        assert merge_spans([(0, 3), (5, 8)]) == [(0, 3), (5, 8)]

    def test_gap_bridges_when_asked(self):
        assert merge_spans([(0, 3), (5, 8)], gap=2) == [(0, 8)]

    def test_unsorted_input(self):
        assert merge_spans([(10, 14), (0, 4), (2, 6)]) == [(0, 6), (10, 14)]


class TestExpandTitles:
    def test_leading_malay_honorific(self):
        text = "Tolong ingatkan Encik Rahman pasal mesyuarat."
        # the NER proposes only the bare name
        start = text.index("Rahman")
        out = expand_titles([(start, start + len("Rahman"))], text)
        assert text[out[0][0]:out[0][1]] == "Encik Rahman"

    def test_trailing_chinese_title(self):
        text = "鲁迅先生在《朝花夕拾》中回忆了自己的童年往事。"
        out = expand_titles([(0, 2)], text)  # NER proposed 鲁迅
        assert text[out[0][0]:out[0][1]] == "鲁迅先生"

    def test_longest_title_wins(self):
        text = "Ucapan Dato' Seri Anwar disiarkan langsung."
        start = text.index("Anwar")
        out = expand_titles([(start, start + len("Anwar"))], text)
        assert text[out[0][0]:out[0][1]] == "Dato' Seri Anwar"

    def test_no_title_leaves_span_alone(self):
        text = "Ask Alice about the report."
        start = text.index("Alice")
        assert expand_titles([(start, start + 5)], text) == [(start, start + 5)]

    def test_does_not_match_a_title_inside_a_longer_word(self):
        # "Sir" must not be pulled out of "Kasir"
        text = "Kasir Rahman sudah balik."
        start = text.index("Rahman")
        out = expand_titles([(start, start + len("Rahman"))], text)
        assert text[out[0][0]:out[0][1]] == "Rahman"


class TestRepairSpans:
    def test_fragmented_chinese_org_is_made_whole(self):
        text = "我们公司目前欠阿里巴巴一笔大型服务器租赁费。"
        s = text.index("阿里巴巴")
        # the NER proposed a single character plus the full name
        out = repair_spans([(s, s + 1), (s, s + 4)], text)
        assert len(out) == 1
        assert text[out[0][0]:out[0][1]] == "阿里巴巴"

    def test_fragment_plus_title_together(self):
        text = "请联系林女士确认订单。"
        s = text.index("林")
        out = repair_spans([(s, s + 1)], text)  # NER proposed only 林
        assert text[out[0][0]:out[0][1]] == "林女士"

    def test_repair_is_idempotent(self):
        text = "Tolong hubungi Encik Rahman esok."
        s = text.index("Rahman")
        once = repair_spans([(s, s + 6)], text)
        assert repair_spans(once, text) == once

    def test_empty_input(self):
        assert repair_spans([], "anything") == []


class TestCoverage:
    def test_full_coverage(self):
        assert coverage(0, 4, [(0, 4)]) == 1.0

    def test_fragment_is_partial_not_full(self):
        # the whole point: 1 of 4 characters is 0.25, not a hit
        assert coverage(0, 4, [(0, 1)]) == pytest.approx(0.25)

    def test_two_fragments_can_sum_to_full(self):
        assert coverage(0, 4, [(0, 2), (2, 4)]) == 1.0

    def test_no_overlap_is_zero(self):
        assert coverage(10, 14, [(0, 4)]) == 0.0

    def test_over_long_span_still_counts_as_full(self):
        # masking extra text costs utility, not privacy
        assert coverage(5, 9, [(0, 20)]) == 1.0

    def test_degenerate_gold(self):
        assert coverage(5, 5, [(0, 20)]) == 0.0
