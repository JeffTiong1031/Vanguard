"""Export the trained model as JSON the browser can evaluate directly.

A LinearSVC is a dot product, so the browser needs no ML runtime -- only the
vocabulary, the IDF vector, and the coefficients.

Coefficients are PRUNED to the top-N by magnitude per category and stored
sparsely. A dense export is a few hundred thousand floats per category and runs
to megabytes; pruning trades a negligible amount of accuracy (verified by
re-running evaluate.py against the pruned model) for a file that is reasonable
to commit.
"""
import json
from pathlib import Path

import numpy as np
from sklearn.preprocessing import normalize

from corpus.schema import CATEGORIES
from evaluate import choose_thresholds
from train import CORPUS, load_all, train
from corpus.schema import load

OUT = (
    Path(__file__).parent.parent
    / "extension" / "src" / "detection" / "ethics" / "model.json"
)
TOP_N = 3000     # coefficients kept per category (estimate; Step 3 verifies it)


def main() -> None:
    rows = load_all()
    union, models = train(rows)

    word = dict(union.transformer_list)["word"]
    char = dict(union.transformer_list)["char"]
    word_size = len(word.vocabulary_)

    hard_rows = load(CORPUS / "hard_negatives.jsonl")
    x_hard = normalize(union.transform([r["text"] for r in hard_rows]), norm="l2")
    thresholds = choose_thresholds(models, x_hard, None, None)

    categories = []
    kept_indices: set[int] = set()
    for category in CATEGORIES:
        coef = models[category].coef_[0]
        top = np.argsort(np.abs(coef))[-TOP_N:]
        top = [int(i) for i in top if coef[i] != 0.0]
        kept_indices.update(top)
        categories.append({
            "key": category,
            "threshold": thresholds[category],
            "intercept": float(models[category].intercept_[0]),
            # [[featureIndex, weight], ...] -- sparse, so the file stays small
            "coef": [[i, round(float(coef[i]), 6)] for i in sorted(top)],
        })

    def branch(vectorizer, offset: int) -> dict:
        """Emit only vocabulary entries some category actually uses."""
        vocab, idf = {}, {}
        for term, index in vectorizer.vocabulary_.items():
            global_index = int(index) + offset
            if global_index in kept_indices:
                vocab[term] = global_index
                idf[str(global_index)] = round(float(vectorizer.idf_[index]), 6)
        return {"vocab": vocab, "idf": idf}

    model = {
        "version": 1,
        "settings": {
            "lowercase": True,
            "word_ngram_range": [1, 2],
            "char_ngram_range": [3, 5],
        },
        "word": branch(word, 0),
        "char": branch(char, word_size),
        "categories": categories,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")

    size = OUT.stat().st_size
    print(f"wrote {OUT}")
    print(f"MEASURED SIZE: {size:,} bytes ({size / 1024:.0f} KB)")
    print(f"word terms kept: {len(model['word']['vocab']):,}")
    print(f"char terms kept: {len(model['char']['vocab']):,}")


if __name__ == "__main__":
    main()
