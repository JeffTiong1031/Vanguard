"""Tests for the exact-match org dictionary (ADR 0004).

The false-positive cases matter more than the hits here: this layer's entire value is its
precision, and precision is quasi-contractual under ADR 0001.
"""
from sens.org_dictionary import find_terms, normalise_terms, propose


class TestNormalise:
    def test_longest_first(self):
        out = normalise_terms(["Maju Trading", "Maju Trading Sdn Bhd", "Acme"])
        assert out[0] == "Maju Trading Sdn Bhd"

    def test_deduplicates_case_insensitively(self):
        assert len(normalise_terms(["Acme", "ACME", "acme"])) == 1

    def test_drops_blanks(self):
        assert normalise_terms(["", "   ", "Acme"]) == ["Acme"]


class TestFindTerms:
    def test_finds_a_plain_term(self):
        text = "We owe Boeing RM500,000 for the parts."
        assert find_terms(text, ["Boeing"]) == [(7, 13)]

    def test_finds_all_occurrences(self):
        text = "Boeing invoiced us; Boeing has not been paid."
        assert len(find_terms(text, ["Boeing"])) == 2

    def test_cjk_needs_no_boundary(self):
        text = "我们公司目前欠阿里巴巴一笔大型服务器租赁费。"
        out = find_terms(text, ["阿里巴巴"])
        assert text[out[0][0]:out[0][1]] == "阿里巴巴"

    def test_longer_term_is_matched_when_listed_first(self):
        text = "Invois daripada Maju Trading Sdn Bhd masih tertunggak."
        terms = normalise_terms(["Maju Trading", "Maju Trading Sdn Bhd"])
        out = find_terms(text, terms)
        assert (text.index("Maju Trading"),
                text.index("Maju Trading Sdn Bhd") + len("Maju Trading Sdn Bhd")) in out


class TestPrecision:
    """The failure mode ADR 0004's exact-match rule exists to prevent."""

    def test_does_not_match_inside_a_longer_word(self):
        # 'Grab' must not fire inside 'Grabbed'
        assert find_terms("He grabbed Grabbed things", ["Grabbed"]) == [(11, 18)]
        assert find_terms("She grabbedit quickly", ["Grab"]) == []

    def test_respects_a_trailing_boundary(self):
        assert find_terms("Acmex is not Acme", ["Acme"]) == [(13, 17)]

    def test_respects_a_leading_boundary(self):
        assert find_terms("MegaAcme is not Acme", ["Acme"]) == [(16, 20)]

    def test_is_case_sensitive(self):
        # "an apple a day" must not be masked because Apple Inc is in the dictionary
        assert find_terms("I ate an apple a day", ["Apple"]) == []
        assert find_terms("Summarise Apple earnings", ["Apple"]) == [(10, 15)]

    def test_punctuation_is_a_boundary(self):
        assert find_terms("Ask Acme, then leave.", ["Acme"]) == [(4, 8)]

    def test_empty_dictionary_proposes_nothing(self):
        assert find_terms("Anything at all", []) == []


class TestPropose:
    def test_unions_with_ner_spans(self):
        text = "Tolong bayar bil tertunggak TNB sebelum hujung minggu."
        ner = [(0, 6)]
        out = propose(text, ["TNB"], ner_spans=ner)
        assert (0, 6) in out
        assert (text.index("TNB"), text.index("TNB") + 3) in out

    def test_deduplicates_against_ner(self):
        text = "We owe Boeing money."
        s = text.index("Boeing")
        out = propose(text, ["Boeing"], ner_spans=[(s, s + 6)])
        assert out.count((s, s + 6)) == 1

    def test_works_without_ner_spans(self):
        text = "我们欠腾讯的服务费。"
        assert propose(text, ["腾讯"]) == [(3, 5)]
