import hashlib
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app import limits
from app.models import Coverage, ErrorCode, ErrorResponse, ExtractResponse
from app.parsers.docx import parse_docx
from app.parsers.pdf import parse_pdf
from app.parsers.text import parse_text, truncate
from app.safety import SafetyError, guard_zip, run_with_timeout, sniff_format

log = logging.getLogger("vanguard")
router = APIRouter()

_STATUS = {
    ErrorCode.TOO_LARGE: 413,
    ErrorCode.UNSUPPORTED_TYPE: 415,
    ErrorCode.PASSWORD_PROTECTED: 422,
    ErrorCode.NO_TEXT_LAYER: 422,
    ErrorCode.PARSE_FAILED: 422,
    ErrorCode.SUSPICIOUS_ARCHIVE: 422,
    ErrorCode.TIMEOUT: 504,
    ErrorCode.EXTRACT_MISMATCH: 409,
    ErrorCode.REDACTION_FAILED: 422,
}


def _fail(err: SafetyError) -> JSONResponse:
    # Log the CODE and the SIZE. Never the name, never the bytes, never the
    # extract. I3: classes and counts, never values.
    log.info("extract rejected code=%s", err.code.value)
    return JSONResponse(
        status_code=_STATUS[err.code],
        content=ErrorResponse.of(err.code, err.message).model_dump(mode="json"),
    )


@router.post("/v1/extract")
async def extract(request: Request) -> JSONResponse:
    """Parse a file to text. Return the text. Keep nothing.

    🔴 The body is read manually rather than via `UploadFile` on purpose.
    Starlette's UploadFile is a SpooledTemporaryFile with a 1 MB rollover, so
    every file over 1 MB would be written to DISK before our code ran -- F4
    broken by a framework default, which is doc 02 section 4.3's exact
    failure mode and CLAUDE.md's "defaults are where the trap lives".
    """
    filename = request.headers.get("x-vanguard-filename", "upload")

    declared = request.headers.get("content-length")
    if declared and int(declared) > limits.MAX_UPLOAD_BYTES:
        return _fail(SafetyError(
            ErrorCode.TOO_LARGE,
            f"This file is {int(declared) / 1024 / 1024:.0f} MB. The limit is 10 MB, "
            "so it was not checked and has not been sent to the AI.",
        ))

    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > limits.MAX_UPLOAD_BYTES + 4096:   # slack for multipart framing
            return _fail(SafetyError(
                ErrorCode.TOO_LARGE,
                "This file is larger than the 10 MB limit, so it was not checked "
                "and has not been sent to the AI.",
            ))

    body, parsed_name = _split_multipart(bytes(data))
    if parsed_name:
        filename = parsed_name

    try:
        kind = sniff_format(filename, body)
        if kind == "docx":
            guard_zip(body)
            text, coverage, warnings, _nodes = run_with_timeout(
                parse_docx, body, limits.PARSE_TIMEOUT_SECONDS
            )
        elif kind == "pdf":
            text, coverage, warnings, _nodes = run_with_timeout(
                parse_pdf, body, limits.PARSE_TIMEOUT_SECONDS
            )
        else:
            text, coverage, warnings, _nodes = parse_text(filename, body)
    except SafetyError as err:
        return _fail(err)
    finally:
        # Explicit, and load-bearing as documentation even though CPython
        # would collect these anyway: nothing here is handed onward.
        data.clear()

    text, was_truncated = truncate(text)
    if was_truncated:
        warnings.append(
            f"Only the first {limits.MAX_EXTRACT_CHARS:,} characters were checked."
        )

    log.info("extract ok format=%s chars=%d truncated=%s", kind, len(text), was_truncated)
    return JSONResponse(
        status_code=200,
        content=ExtractResponse(
            extract=text,
            # Bound to the exact text the user is about to review. /v1/redact
            # recomputes it and refuses on mismatch (Task 5B).
            extract_sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
            chars=len(text),
            truncated=was_truncated,
            format="csv" if kind == "csv" else kind,
            coverage=coverage if isinstance(coverage, Coverage) else Coverage(**coverage),
            warnings=warnings,
        ).model_dump(mode="json"),
    )


def _split_multipart(raw: bytes) -> tuple[bytes, str | None]:
    """Minimal multipart/form-data extraction of the single `file` part.

    A full parser is not needed for a one-field form, and avoiding
    python-multipart's UploadFile keeps the spool-to-disk path closed.
    """
    if not raw.startswith(b"--"):
        return raw, None
    boundary = raw.split(b"\r\n", 1)[0]
    parts = raw.split(boundary)
    for part in parts:
        head, _, tail = part.partition(b"\r\n\r\n")
        if b'name="file"' not in head:
            continue
        name = None
        marker = b'filename="'
        if marker in head:
            start = head.index(marker) + len(marker)
            name = head[start : head.index(b'"', start)].decode("utf-8", "replace")
        return tail.rstrip(b"\r\n-"), name
    return raw, None
