import pytest
from pydantic import ValidationError
from app.models import Coverage, ErrorCode, ErrorResponse, ExtractResponse


def test_extract_response_round_trips():
    r = ExtractResponse(
        extract="Ahmad bin Ali, 880101-14-5566",
        extract_sha256="b" * 64,
        chars=29,
        truncated=False,
        format="docx",
        coverage=Coverage(
            read=["body", "headers", "footers", "comments"],
            not_read=["3 embedded images"],
            pages_total=None,
            pages_with_text=None,
        ),
        warnings=[],
    )
    assert r.model_dump()["coverage"]["not_read"] == ["3 embedded images"]
    assert len(r.extract_sha256) == 64


def test_error_response_uses_the_closed_code_set():
    e = ErrorResponse.of(ErrorCode.TOO_LARGE, "This file is 24 MB. The limit is 10 MB.")
    assert e.error.code == "too_large"
    assert e.error.message.startswith("This file is")


def test_error_code_set_is_closed():
    with pytest.raises(ValueError):
        ErrorCode("something_new")


def test_extract_response_carries_a_hash_the_redact_call_can_verify():
    from app.models import RedactRequest, RedactSpan
    r = ExtractResponse(
        extract="Ahmad 880101-14-5566",
        extract_sha256="a" * 64,
        chars=20,
        truncated=False,
        format="docx",
        coverage=Coverage(read=["body"], not_read=[], pages_total=None, pages_with_text=None),
        warnings=[],
    )
    req = RedactRequest(
        extract_sha256=r.extract_sha256,
        spans=[RedactSpan(start=6, end=20, text="880101-14-5566", placeholder="NRIC_1")],
    )
    assert req.spans[0].placeholder == "NRIC_1"


def test_redact_span_rejects_an_inverted_range():
    from app.models import RedactSpan
    with pytest.raises(ValidationError):
        RedactSpan(start=20, end=6, text="x", placeholder="NRIC_1")
