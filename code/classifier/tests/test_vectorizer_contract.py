"""The vectorizer settings are a cross-language contract.

src/detection/ethics/vectorize.ts reimplements these exact choices in
TypeScript. Anything not pinned here is something the JS side can silently
disagree about, and the disagreement shows up as a wrong verdict, not an error.
"""
from train import VECTORIZER_SETTINGS, build_vectorizer


def test_settings_are_pinned():
    assert VECTORIZER_SETTINGS == {
        "lowercase": True,
        "word_ngram_range": (1, 2),
        "word_token_pattern": r"(?u)\b\w\w+\b",
        "word_max_features": 8000,
        "char_analyzer": "char_wb",
        "char_ngram_range": (3, 5),
        "char_max_features": 12000,
        "sublinear_tf": False,
        "smooth_idf": True,
        "norm": "l2",
    }


def test_the_union_has_exactly_two_branches_in_a_fixed_order():
    """Feature index order defines the coefficient layout. Word block first."""
    union = build_vectorizer()
    names = [name for name, _ in union.transformer_list]
    assert names == ["word", "char"]


def test_char_wb_pads_words_with_spaces():
    """Pinning sklearn's documented char_wb behaviour, because vectorize.ts
    must reproduce it exactly and it is the least obvious part."""
    union = build_vectorizer()
    union.fit(["ab"])
    char = dict(union.transformer_list)["char"]
    # " ab " -> 3-grams " ab", "ab "
    assert " ab" in char.vocabulary_
