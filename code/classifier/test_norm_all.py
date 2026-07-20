import json
from train import load_all, train
import numpy as np

with open('../extension/src/detection/ethics/model.json', 'r') as f:
    model = json.load(f)

union, models = train(load_all())

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

js_vocab = set(model['word']['vocab'].values()) | set(model['char']['vocab'].values())

for text in TEXTS:
    x_dense = union.transform([text]).toarray()[0]
    python_norm = np.linalg.norm(x_dense)
    js_sum_squares = 0
    for i in np.nonzero(x_dense)[0]:
        if i in js_vocab:
            js_sum_squares += x_dense[i] ** 2
    js_norm = np.sqrt(js_sum_squares)
    print(f"Text: {text!r}")
    print(f"  Python norm: {python_norm}")
    print(f"  JS norm:     {js_norm}")
    print(f"  Diff:        {abs(python_norm - js_norm)}")
