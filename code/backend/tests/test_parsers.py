import io
import zipfile
from pathlib import Path

import pytest

from app.models import ErrorCode
from app.parsers.docx import parse_docx
from app.parsers.pdf import parse_pdf
from app.parsers.text import parse_text, truncate
from app.safety import SafetyError

FIX = Path(__file__).parent / "fixtures"


def _docx(parts: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, body in parts.items():
            z.writestr(name, body)
    return buf.getvalue()


NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def test_text_decodes_utf8_and_reports_coverage():
    extract, coverage, _, _ = parse_text("notes.txt", "Ahmad 880101-14-5566".encode())
    assert "880101-14-5566" in extract
    assert coverage.read == ["file text"]


def test_text_survives_a_bad_encoding_rather_than_failing_the_scan():
    extract, _, warnings, _ = parse_text("notes.txt", b"caf\xe9 880101-14-5566")
    assert "880101-14-5566" in extract
    assert any("encoding" in w for w in warnings)


def test_truncate_flags_when_it_cuts():
    body, cut = truncate("x" * 200_000)
    assert cut is True
    assert len(body) == 100_000


def test_docx_reads_the_body():
    data = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>Ahmad 880101-14-5566</w:t></w:p></w:body></w:document>",
    })
    extract, coverage, _, _ = parse_docx(data)
    assert "880101-14-5566" in extract
    assert "body" in coverage.read


def test_docx_reads_comments_headers_and_footnotes():
    # python-docx's paragraph walk misses every one of these. An NRIC in a
    # Word comment must not be invisible to us and visible to the provider.
    data = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>clean body</w:t></w:p></w:body></w:document>",
        "word/comments.xml": f"<w:comments {NS}><w:comment><w:p><w:t>his IC is 880101-14-5566</w:t></w:p></w:comment></w:comments>",
        "word/header1.xml": f"<w:hdr {NS}><w:p><w:t>ACME SDN BHD 201201234567</w:t></w:p></w:hdr>",
        "word/footnotes.xml": f"<w:footnotes {NS}><w:footnote><w:p><w:t>ahmad@acme.com</w:t></w:p></w:footnote></w:footnotes>",
    })
    extract, coverage, _, _ = parse_docx(data)
    assert "880101-14-5566" in extract
    assert "201201234567" in extract
    assert "ahmad@acme.com" in extract
    assert {"body", "comments", "headers", "footnotes"} <= set(coverage.read)


def test_docx_offset_map_points_back_at_the_source_node():
    # Task 12 applies masks to the ORIGINAL docx, so every extract character
    # must be traceable to the w:t node it came from.
    data = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>Ahmad </w:t><w:t>880101-14-5566</w:t></w:p></w:body></w:document>",
    })
    extract, _, _, nodes = parse_docx(data)
    hit = next(n for n in nodes if extract[n.extract_start:n.extract_start + n.length] == "880101-14-5566")
    assert hit.part == "word/document.xml"
    assert hit.node_index == 1


def test_docx_offset_map_covers_a_span_split_across_runs():
    # Word routinely splits one word across runs (spell-check, formatting), so
    # a single finding maps to SEVERAL nodes. Task 12 must handle that; this
    # test is what proves the map carries enough to do it.
    data = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>880101</w:t><w:t>-14-5566</w:t></w:p></w:body></w:document>",
    })
    extract, _, _, nodes = parse_docx(data)
    start = extract.index("880101-14-5566")
    touched = [n for n in nodes if n.extract_start < start + 14 and n.extract_start + n.length > start]
    assert len(touched) == 2


def test_docx_reports_images_as_not_read():
    data = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>hi</w:t></w:p></w:body></w:document>",
        "word/media/image1.png": "\x89PNG",
        "word/media/image2.png": "\x89PNG",
    })
    _, coverage, _, _ = parse_docx(data)
    assert coverage.not_read == ["2 embedded images (no OCR)"]


def test_pdf_without_a_text_layer_is_an_ERROR_not_a_clean_scan():
    # The single most dangerous output this feature can produce is
    # "0 characters, all clear" on a scanned payroll PDF.
    scanned = (FIX / "scanned_no_text.pdf").read_bytes()
    with pytest.raises(SafetyError) as e:
        parse_pdf(scanned)
    assert e.value.code == ErrorCode.NO_TEXT_LAYER


def test_pdf_that_is_damaged_fails_loudly():
    with pytest.raises(SafetyError) as e:
        parse_pdf((FIX / "truncated.pdf").read_bytes())
    assert e.value.code == ErrorCode.PARSE_FAILED
