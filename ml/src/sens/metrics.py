from __future__ import annotations


def mask_precision_recall(gold: list[str], pred: list[str]) -> tuple[float, float]:
    if len(gold) != len(pred):
        raise ValueError("gold and pred must be the same length")
    tp = sum(1 for g, p in zip(gold, pred) if g == "MASK" and p == "MASK")
    fp = sum(1 for g, p in zip(gold, pred) if g == "KEEP" and p == "MASK")
    fn = sum(1 for g, p in zip(gold, pred) if g == "MASK" and p == "KEEP")
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    return precision, recall


def mask_recall(gold: list[str], pred: list[str]) -> float:
    return mask_precision_recall(gold, pred)[1]


def full_mention_coverage(entities: dict[str, list[bool]]) -> float:
    if not entities:
        return 1.0
    covered = sum(1 for hits in entities.values() if all(hits))
    return covered / len(entities)
