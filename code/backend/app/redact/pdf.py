"""In-place PDF text redaction, images preserved. Gated on U30 (Task 1B).

Two disclosed behaviours the review UI must not contradict:
  1. Redaction is by STRING SEARCH, so every occurrence of an accepted span is
     removed, not only the one the user hovered. Over-redaction is the
     fail-safe direction, but it IS a semantic difference.
  2. Text inside images is untouched. Keeping images is not cleaning them.
"""
import io

import fitz  # PyMuPDF -- licence position recorded in the U30 spike README

from app.models import ErrorCode, RedactSpan
from app.safety import SafetyError


def redact_pdf(data: bytes, spans: list[RedactSpan]) -> bytes:
    doc = fitz.open(stream=data, filetype="pdf")
    located = {span.text: 0 for span in spans}

    for page in doc:
        for span in spans:
            for rect in page.search_for(span.text):
                page.add_redact_annot(rect, text=span.placeholder, fill=(1, 1, 1))
                located[span.text] += 1
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

    missing = [text for text, count in located.items() if count == 0]
    if missing:
        raise SafetyError(
            ErrorCode.REDACTION_FAILED,
            f"Vanguard could not apply {len(missing)} of the masks to this PDF, so "
            "nothing was changed and the file has not been sent to the AI.",
        )

    out = io.BytesIO()
    doc.save(out, garbage=3, deflate=True)
    payload = out.getvalue()

    residual = "\n".join(page.get_text() for page in fitz.open(stream=payload, filetype="pdf"))
    still_there = [span.text for span in spans if span.text in residual]
    if still_there:
        raise SafetyError(
            ErrorCode.REDACTION_FAILED,
            "Vanguard could not fully remove the selected text from this PDF, so "
            "nothing was changed and the file has not been sent to the AI.",
        )

    return payload
