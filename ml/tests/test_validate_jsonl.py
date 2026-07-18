from pathlib import Path

from sens.validate_jsonl import load_jsonl, validate_path

FIXTURES = Path(__file__).resolve().parents[1] / "data" / "fixtures" / "tiny_train.jsonl"


def test_load_fixture():
    rows = load_jsonl(FIXTURES)
    assert len(rows) == 3
    assert rows[1].spans[0].surface == "Ahmad bin Ali"
    assert rows[1].spans[0].label == "MASK"


def test_validate_ok():
    assert validate_path(FIXTURES) == []
