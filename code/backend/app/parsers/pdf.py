import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app import limits
from app.models import Coverage, ErrorCode
from app.parsers.text import ExtractResult
from app.safety import SafetyError


def parse_pdf(data: bytes) -> ExtractResult:
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
    except (PdfReadError, ValueError, OSError) as exc:
        raise SafetyError(
            ErrorCode.PARSE_FAILED,
            "This PDF looks damaged and could not be opened. It has not been "
            "sent to the AI.",
        ) from exc

    if reader.is_encrypted:
        try:
            opened = reader.decrypt("")   # some PDFs are "encrypted" with an empty owner password
        except Exception:
            opened = 0
        if not opened:
            raise SafetyError(
                ErrorCode.PASSWORD_PROTECTED,
                "This PDF is password-protected, so it could not be checked. "
                "It has not been sent to the AI.",
            )

    pages = reader.pages
    warnings: list[str] = []
    if len(pages) > limits.MAX_PDF_PAGES:
        warnings.append(
            f"Only the first {limits.MAX_PDF_PAGES} pages were checked "
            f"(this PDF has {len(pages)})."
        )
        pages = pages[: limits.MAX_PDF_PAGES]

    texts: list[str] = []
    with_text = 0
    for page in pages:
        try:
            body = page.extract_text() or ""
        except Exception:                    # one bad page must not fail the file
            body = ""
        if len(body.strip()) >= limits.MIN_CHARS_PER_PAGE:
            with_text += 1
        texts.append(body)

    # 🔴 Pushback 3. Zero characters with a CLEAN verdict on a scanned payroll
    # PDF is the most dangerous output this feature can produce. Low yield is
    # an ERROR the user is told about -- never a quiet pass.
    if with_text == 0:
        raise SafetyError(
            ErrorCode.NO_TEXT_LAYER,
            "This PDF looks like a scan or photos rather than text, so "
            "Vanguard could not read it. It has not been sent to the AI. "
            "Reading scanned documents is not supported yet.",
        )
    if with_text < len(pages):
        warnings.append(
            f"{len(pages) - with_text} of {len(pages)} pages had no readable "
            "text (likely scans) and were not checked."
        )

    coverage = Coverage(
        read=["text layer"],
        not_read=(
            [f"{len(pages) - with_text} pages with no text layer (no OCR)"]
            if with_text < len(pages)
            else []
        ),
        pages_total=len(reader.pages),
        pages_with_text=with_text,
    )
    return "\n".join(texts), coverage, warnings, []
