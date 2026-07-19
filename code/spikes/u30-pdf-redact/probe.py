"""U30 -- in-place PDF text redaction that keeps images.

pypdf can READ a text layer; it cannot reliably REMOVE text at a position.
PyMuPDF's add_redact_annot/apply_redactions is the only mature route, so the
spike is really "does PyMuPDF hold up on our inputs, and can we use it."

🔴 LICENSING IS PART OF THE VERDICT, NOT A FOOTNOTE. PyMuPDF is AGPL-3.0 or
commercial. Shipping AGPL code in a distributed product is a diligence finding
if nobody decided it on purpose. A PASS here is "it works AND we know what it
costs to use", never just the first half.
"""
import sys
from pathlib import Path

import fitz  # PyMuPDF


def redact(path: Path, spans: list[str], out: Path) -> dict:
    doc = fitz.open(path)
    images_before = sum(len(p.get_images(full=True)) for p in doc)
    hits = {s: 0 for s in spans}

    for page in doc:
        for span in spans:
            # 🔴 search_for finds EVERY occurrence, not the one span the user
            # reviewed. Over-redaction is the fail-safe direction, but it IS a
            # semantic change and the review UI must not imply otherwise.
            for rect in page.search_for(span):
                page.add_redact_annot(rect, fill=(0, 0, 0))
                hits[span] += 1
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)  # keep images

    doc.save(out, garbage=3, deflate=True)
    images_after = sum(len(p.get_images(full=True)) for p in fitz.open(out))
    residual = "\n".join(p.get_text() for p in fitz.open(out))

    return {
        "hits": hits,
        "missed": [s for s, n in hits.items() if n == 0],
        "still_present": [s for s in spans if s in residual],
        "images_before": images_before,
        "images_after": images_after,
    }


if __name__ == "__main__":
    src = Path(sys.argv[1])
    spans = sys.argv[2:]
    result = redact(src, spans, src.with_suffix(".redacted.pdf"))
    for key, value in result.items():
        print(f"{key}: {value}")
