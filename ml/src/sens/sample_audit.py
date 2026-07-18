from __future__ import annotations

import random
from collections import defaultdict

from sens.schema import Example


def _has_mask(ex: Example) -> bool:
    return any(sp.label == "MASK" for sp in ex.spans)


def stratified_sample(examples: list[Example], n: int, seed: int = 0) -> list[Example]:
    if n <= 0:
        raise ValueError("n must be positive")
    if n > len(examples):
        raise ValueError("n exceeds pool size")

    buckets: dict[tuple[str, bool], list[Example]] = defaultdict(list)
    for ex in examples:
        buckets[(ex.lang, _has_mask(ex))].append(ex)

    rng = random.Random(seed)
    for b in buckets.values():
        rng.shuffle(b)

    keys = sorted(buckets.keys())
    out: list[Example] = []
    idx = {k: 0 for k in keys}
    while len(out) < n:
        progressed = False
        for k in keys:
            i = idx[k]
            bucket = buckets[k]
            if i < len(bucket):
                out.append(bucket[i])
                idx[k] = i + 1
                progressed = True
                if len(out) >= n:
                    break
        if not progressed:
            break
    if len(out) < n:
        raise ValueError("could not fill sample; pool too skewed")
    return out
