from pathlib import Path

from sens.validate_jsonl import load_jsonl, validate_path

FIXTURES = Path(__file__).resolve().parents[1] / "data" / "fixtures" / "tiny_train.jsonl"


def test_load_fixture():
    rows = load_jsonl(FIXTURES)
    assert len(rows) >= 12
    by_id = {r.id: r for r in rows}
    assert by_id["fx-einstein-keep"].spans[0].surface == "Einstein"
    assert by_id["fx-einstein-keep"].spans[0].label == "KEEP"
    assert by_id["fx-einstein-mask"].spans[0].label == "MASK"
    assert by_id["fx-math"].spans == []
    assert "math_no_mask" in by_id["fx-math"].tags


def test_validate_ok():
    assert validate_path(FIXTURES) == []
