from pathlib import Path

import pytest

from corpus.schema import CATEGORIES, load, validate

CORPUS = Path(__file__).parent.parent / "corpus"


def test_there_are_exactly_six_categories():
    assert len(CATEGORIES) == 6
    assert "covert_surveillance" in CATEGORIES
    assert "undisclosed_profiling" in CATEGORIES


def test_positives_cover_every_category():
    rows = load(CORPUS / "positives.jsonl")
    seen = {r["label"] for r in rows}
    assert seen == set(CATEGORIES), f"missing: {set(CATEGORIES) - seen}"


def test_every_category_has_enough_examples_to_train_on():
    rows = load(CORPUS / "positives.jsonl")
    for category in CATEGORIES:
        n = sum(1 for r in rows if r["label"] == category)
        assert n >= 40, f"{category} has only {n} examples"


def test_negatives_are_labelled_none():
    for name in ("negatives.jsonl", "hard_negatives.jsonl"):
        for row in load(CORPUS / name):
            assert row["label"] is None, f"{name}: {row['text'][:40]!r} is not a negative"


def test_hard_negatives_exist_and_are_actually_hard():
    """A hard negative must share vocabulary with a positive.

    A 'hard negative' that shares no words with any positive is just a
    negative, and it would pass trivially while proving nothing.
    """
    hard = load(CORPUS / "hard_negatives.jsonl")
    assert len(hard) >= 30
    positive_words = {
        w for r in load(CORPUS / "positives.jsonl") for w in r["text"].lower().split()
    }
    for row in hard:
        overlap = set(row["text"].lower().split()) & positive_words
        assert len(overlap) >= 2, f"not actually hard: {row['text']!r}"


def test_no_duplicate_text_across_the_whole_corpus():
    texts = [
        r["text"].strip().lower()
        for name in ("positives.jsonl", "negatives.jsonl", "hard_negatives.jsonl")
        for r in load(CORPUS / name)
    ]
    duplicates = {t for t in texts if texts.count(t) > 1}
    assert not duplicates, f"duplicated rows leak between train and test: {list(duplicates)[:3]}"


def test_validate_rejects_an_unknown_label():
    with pytest.raises(ValueError, match="unknown label"):
        validate([{"text": "x", "label": "not_a_category"}])
