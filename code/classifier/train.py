"""Train the six-category ethics classifier.

One-vs-rest LinearSVC over a union of word and character n-grams. Character
n-grams buy partial robustness to paraphrase and typos; word n-grams carry most
of the signal.
"""
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC

from corpus.schema import CATEGORIES, Row, load

CORPUS = Path(__file__).parent / "corpus"

# 🔴 A CONTRACT WITH src/detection/ethics/vectorize.ts. Every value changes the
# numbers the browser must reproduce. Pinned by tests/test_vectorizer_contract.py.
VECTORIZER_SETTINGS = {
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


def build_vectorizer() -> FeatureUnion:
    """Word branch first, then char. This order IS the coefficient layout."""
    word = TfidfVectorizer(
        lowercase=VECTORIZER_SETTINGS["lowercase"],
        ngram_range=VECTORIZER_SETTINGS["word_ngram_range"],
        token_pattern=VECTORIZER_SETTINGS["word_token_pattern"],
        max_features=VECTORIZER_SETTINGS["word_max_features"],
        sublinear_tf=VECTORIZER_SETTINGS["sublinear_tf"],
        smooth_idf=VECTORIZER_SETTINGS["smooth_idf"],
        norm=None,        # normalise ONCE over the concatenation, in export/runtime
    )
    char = TfidfVectorizer(
        lowercase=VECTORIZER_SETTINGS["lowercase"],
        analyzer=VECTORIZER_SETTINGS["char_analyzer"],
        ngram_range=VECTORIZER_SETTINGS["char_ngram_range"],
        max_features=VECTORIZER_SETTINGS["char_max_features"],
        sublinear_tf=VECTORIZER_SETTINGS["sublinear_tf"],
        smooth_idf=VECTORIZER_SETTINGS["smooth_idf"],
        norm=None,
    )
    return FeatureUnion([("word", word), ("char", char)])


def load_all() -> list[Row]:
    return (
        load(CORPUS / "positives.jsonl")
        + load(CORPUS / "negatives.jsonl")
        + load(CORPUS / "hard_negatives.jsonl")
    )


def train(rows: list[Row]) -> tuple[FeatureUnion, dict[str, LinearSVC]]:
    texts = [r["text"] for r in rows]
    union = build_vectorizer()
    x = union.fit_transform(texts)
    # L2-normalise the CONCATENATED vector, once. Both branches use norm=None so
    # the browser can do the same thing in one place.
    from sklearn.preprocessing import normalize
    x = normalize(x, norm="l2")

    models: dict[str, LinearSVC] = {}
    for category in CATEGORIES:
        y = [1 if r["label"] == category else 0 for r in rows]
        # class_weight balanced: negatives outnumber each category ~10:1, and
        # without it the model learns to always say no.
        model = LinearSVC(C=1.0, class_weight="balanced", max_iter=5000)
        model.fit(x, y)
        models[category] = model
    return union, models


if __name__ == "__main__":
    rows = load_all()
    union, models = train(rows)
    print(f"trained on {len(rows)} rows")
    print(f"features: {len(union.get_feature_names_out())}")
