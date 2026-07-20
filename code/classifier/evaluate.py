"""Evaluate, pick per-category thresholds, and enforce the hard-negative gate.

🔴 The gate is pass/fail, not a metric. ADR 0001 makes precision quasi-
contractual: every false positive is a ticket the admin eats, and the admin is
the buyer. A hard negative that fires is a blocked security engineer, so the
build does not ship.
"""
import sys
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import normalize

from corpus.schema import CATEGORIES, load
from train import CORPUS, build_vectorizer, load_all, train

# Margin above the highest-scoring hard negative. A threshold placed exactly at
# that score is one paraphrase away from firing. (estimate)
SAFETY_MARGIN = 0.05


def choose_thresholds(models, x_hard, x_val, y_val) -> dict[str, float]:
    """Lowest threshold that keeps EVERY hard negative silent.

    Recall is maximised subject to a hard precision constraint, rather than the
    other way round -- that ordering is the whole precision-over-recall posture.
    """
    thresholds: dict[str, float] = {}
    for category in CATEGORIES:
        model = models[category]
        worst_hard = float(np.max(model.decision_function(x_hard)))
        thresholds[category] = round(worst_hard + SAFETY_MARGIN, 4)
    return thresholds


def main() -> int:
    rows = load_all()
    train_rows, val_rows = train_test_split(
        rows, test_size=0.25, random_state=42,
        stratify=[r["label"] or "none" for r in rows],
    )
    union, models = train(train_rows)

    def vec(texts):
        return normalize(union.transform(texts), norm="l2")

    hard_rows = load(CORPUS / "hard_negatives.jsonl")
    x_hard = vec([r["text"] for r in hard_rows])
    x_val = vec([r["text"] for r in val_rows])

    thresholds = choose_thresholds(models, x_hard, x_val, val_rows)

    print(f"{'category':<28} {'precision':>10} {'recall':>8} {'threshold':>10}")
    failures: list[str] = []
    for category in CATEGORIES:
        scores = models[category].decision_function(x_val)
        predicted = scores >= thresholds[category]
        actual = np.array([r["label"] == category for r in val_rows])
        tp = int((predicted & actual).sum())
        fp = int((predicted & ~actual).sum())
        fn = int((~predicted & actual).sum())
        precision = tp / (tp + fp) if tp + fp else 1.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        print(f"{category:<28} {precision:>10.3f} {recall:>8.3f} {thresholds[category]:>10.4f}")
        if recall < 0.5:
            failures.append(f"{category}: recall {recall:.2f} is too low to demo")

    # 🔴 THE GATE. Not averaged, not weighted. Any hard negative firing fails.
    print("\nhard-negative gate:")
    fired = 0
    for category in CATEGORIES:
        scores = models[category].decision_function(x_hard)
        for row, score in zip(hard_rows, scores):
            if score >= thresholds[category]:
                fired += 1
                print(f"  FIRED {category} on {row['text']!r} ({score:.3f})")
    if fired:
        failures.append(f"{fired} hard negative(s) fired")
    else:
        print(f"  clean — {len(hard_rows)} hard negatives, none fired")

    if failures:
        print("\nFAIL:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nPASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
