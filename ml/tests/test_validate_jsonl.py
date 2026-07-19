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


def test_duplicate_ids_are_rejected(tmp_path):
    # A file-level property a per-line validator cannot see. An exam amended by appending rows
    # numbered from an already-taken id passed validate AND coverage while two rows shared an id
    # (observed 2026-07-19). merge_audit and disagreement both key by id, so one row shadows the
    # other silently.
    p = tmp_path / "dup.jsonl"
    row = ('{"id":"x-1","text":"Ask Ali.","lang":"en","provenance":"human_simulated",'
           '"split":"eval","spans":[{"start":4,"end":7,"surface":"Ali",'
           '"entity_type":"PER","label":"MASK"}]}')
    p.write_text(row + "\n" + row + "\n", encoding="utf-8")
    errs = validate_path(p)
    assert any("duplicate id" in e for e in errs)
    assert "x-1" in " ".join(errs)


def test_unique_ids_pass(tmp_path):
    p = tmp_path / "ok.jsonl"
    rows = []
    for i in (1, 2):
        rows.append('{"id":"x-%d","text":"Ask Ali.","lang":"en","provenance":"human_simulated",'
                    '"split":"eval","spans":[{"start":4,"end":7,"surface":"Ali",'
                    '"entity_type":"PER","label":"MASK"}]}' % i)
    p.write_text("\n".join(rows) + "\n", encoding="utf-8")
    assert validate_path(p) == []
