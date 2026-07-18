import io
import json
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
FIX = Path(__file__).parent / "fixtures"


def _docx(parts: dict[str, str | bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, body in parts.items():
            z.writestr(name, body)
    return buf.getvalue()


def _extract(name: str, data: bytes) -> dict:
    return client.post("/v1/extract", files={"file": (name, data, "application/octet-stream")}).json()


def _redact(name: str, data: bytes, spec: dict):
    return client.post(
        "/v1/redact",
        files={"file": (name, data, "application/octet-stream")},
        data={"spec": json.dumps(spec)},
    )


def test_a_masked_docx_comes_back_as_a_docx_with_its_images():
    src = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>Ahmad 880101-14-5566</w:t></w:p></w:body></w:document>",
        "word/media/image1.png": b"\x89PNG-not-really",
    })
    got = _extract("memo.docx", src)
    start = got["extract"].index("880101-14-5566")

    r = _redact("memo.docx", src, {
        "extract_sha256": got["extract_sha256"],
        "spans": [{"start": start, "end": start + 14, "text": "880101-14-5566", "placeholder": "NRIC_1"}],
    })
    assert r.status_code == 200
    assert r.headers["x-vanguard-redacted-name"] == "memo.redacted.docx"

    out = zipfile.ZipFile(io.BytesIO(r.content))
    body = out.read("word/document.xml").decode()
    assert "880101-14-5566" not in body
    assert "NRIC_1" in body
    assert out.read("word/media/image1.png") == b"\x89PNG-not-really"


def test_a_span_split_across_runs_is_fully_removed():
    src = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>880101</w:t><w:t>-14-5566</w:t></w:p></w:body></w:document>",
    })
    got = _extract("split.docx", src)
    start = got["extract"].index("880101-14-5566")
    r = _redact("split.docx", src, {
        "extract_sha256": got["extract_sha256"],
        "spans": [{"start": start, "end": start + 14, "text": "880101-14-5566", "placeholder": "NRIC_1"}],
    })
    body = zipfile.ZipFile(io.BytesIO(r.content)).read("word/document.xml").decode()
    assert "880101" not in body
    assert "-14-5566" not in body
    assert body.count("NRIC_1") == 1


def test_a_stale_extract_hash_is_REFUSED_rather_than_best_efforted():
    src = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>Ahmad 880101-14-5566</w:t></w:p></w:body></w:document>",
    })
    r = _redact("memo.docx", src, {
        "extract_sha256": "0" * 64,
        "spans": [{"start": 6, "end": 20, "text": "880101-14-5566", "placeholder": "NRIC_1"}],
    })
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "extract_mismatch"


def test_a_span_that_cannot_be_located_fails_LOUDLY():
    src = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>nothing sensitive</w:t></w:p></w:body></w:document>",
    })
    got = _extract("memo.docx", src)
    r = _redact("memo.docx", src, {
        "extract_sha256": got["extract_sha256"],
        "spans": [{"start": 0, "end": 5, "text": "ABSENT", "placeholder": "NRIC_1"}],
    })
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "redaction_failed"


def test_csv_redaction_returns_text():
    src = b"name,ic\nAhmad,880101-14-5566\n"
    got = _extract("staff.csv", src)
    start = got["extract"].index("880101-14-5566")
    r = _redact("staff.csv", src, {
        "extract_sha256": got["extract_sha256"],
        "spans": [{"start": start, "end": start + 14, "text": "880101-14-5566", "placeholder": "NRIC_1"}],
    })
    assert r.status_code == 200
    assert r.headers["x-vanguard-redacted-name"] == "staff.redacted.csv"
    assert b"880101-14-5566" not in r.content
    assert b"NRIC_1" in r.content


def test_redact_keeps_nothing(tmp_path):
    import tempfile
    before = set(Path(tempfile.gettempdir()).iterdir())
    src = _docx({"word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>Ahmad</w:t></w:p></w:body></w:document>"})
    got = _extract("m.docx", src)
    _redact("m.docx", src, {"extract_sha256": got["extract_sha256"], "spans": []})
    assert set(Path(tempfile.gettempdir()).iterdir()) - before == set()
