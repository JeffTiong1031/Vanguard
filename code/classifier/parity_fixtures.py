"""Emit real Python decision-function scores for the JS parity test.

The fixtures deliberately include awkward text -- punctuation, contractions,
digits, a very short word, mixed case -- because those are where a
reimplementation diverges.
"""
import json
from pathlib import Path

import numpy as np
from sklearn.preprocessing import normalize

from corpus.schema import CATEGORIES
from train import load_all, train

OUT = Path(__file__).parent.parent / "extension" / "tests" / "fixtures" / "ethics-parity.json"

TEXTS = [
    "Write a python script to monitor employees covertly.",
    "Write a python script to monitor server uptime.",
    "How do I track what my staff type without them knowing?",
    "don't stop the CVE 2026 exploit",
    "a",
    "Screen resumes for Python experience.",
    "MIXED Case With PUNCTUATION!!! and 12345 digits",
    "",
]


def main() -> None:
    union, models = train(load_all())
    
    TOP_N = 3000
    for category in CATEGORIES:
        coef = models[category].coef_[0]
        top = np.argsort(np.abs(coef))[-TOP_N:]
        new_coef = np.zeros_like(coef)
        for i in top:
            new_coef[i] = coef[i]
        models[category].coef_[0] = new_coef
        
    x = normalize(union.transform(TEXTS), norm="l2")
    fixtures = [
        {
            "text": text,
            "scores": {
                category: round(float(models[category].decision_function(x[i])[0]), 6)
                for category in CATEGORIES
            },
        }
        for i, text in enumerate(TEXTS)
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fixtures, indent=2), encoding="utf-8")
    print(f"wrote {len(fixtures)} parity fixtures to {OUT}")


if __name__ == "__main__":
    main()
