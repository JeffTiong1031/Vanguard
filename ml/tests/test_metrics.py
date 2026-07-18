from sens.metrics import mask_precision_recall, mask_recall, full_mention_coverage


def test_precision_recall_basic():
    gold = ["MASK", "MASK", "KEEP", "KEEP"]
    pred = ["MASK", "KEEP", "MASK", "KEEP"]  # tp=1, fp=1, fn=1
    p, r = mask_precision_recall(gold, pred)
    assert p == 0.5
    assert r == 0.5


def test_always_keep_recall_zero_precision_vacuous_one():
    gold = ["MASK", "KEEP", "MASK"]
    pred = ["KEEP", "KEEP", "KEEP"]
    p, r = mask_precision_recall(gold, pred)
    assert p == 1.0     # no false alarms...
    assert r == 0.0     # ...but recall exposes the trivial model
    assert mask_recall(gold, pred) == 0.0


def test_full_mention_coverage():
    # entity "a" has two MASK mentions, one missed -> not fully covered; "b" fully covered
    entities = {"a": [True, False], "b": [True]}
    assert full_mention_coverage(entities) == 0.5


def test_full_mention_coverage_empty_is_one():
    assert full_mention_coverage({}) == 1.0
