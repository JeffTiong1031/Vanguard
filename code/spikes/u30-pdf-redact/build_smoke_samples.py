"""Generate smoke-test PDFs for the U30 redaction spike.

These are synthetic fixtures built with PyMuPDF — NOT the real work corpus.
Real PDFs from real producers (ligatures, hyphenation, multi-column layout,
etc.) are required for a PASS verdict; see README.md.
"""
from pathlib import Path

import fitz  # PyMuPDF

SAMPLES_DIR = Path(__file__).parent / "samples"
FAKE_NRIC = "880101-14-5566"
FAKE_NAME = "Ahmad bin Ali"


def _make_simple_text_pdf(path: Path) -> None:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    text = (
        f"Employee record (SMOKE FIXTURE — not real data)\n\n"
        f"Name: {FAKE_NAME}\n"
        f"NRIC: {FAKE_NRIC}\n"
        f"Department: Finance\n"
    )
    page.insert_text((72, 72), text, fontsize=12)
    doc.save(path)
    doc.close()


def _make_text_with_image_pdf(path: Path) -> None:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    text = (
        f"Invoice summary (SMOKE FIXTURE — not real data)\n\n"
        f"Bill to: {FAKE_NAME}\n"
        f"Reference: {FAKE_NRIC}\n"
    )
    page.insert_text((72, 72), text, fontsize=12)

    # Small embedded image — proves images survive redaction.
    rect = fitz.Rect(72, 200, 172, 300)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 100, 100), 1)
    pix.clear_with(255)  # white fill
    page.insert_image(rect, pixmap=pix)
    pix = None

    doc.save(path)
    doc.close()


def _make_multipage_pdf(path: Path) -> None:
    doc = fitz.open()
    for i in range(1, 4):
        page = doc.new_page(width=595, height=842)
        text = (
            f"Page {i} of 3 (SMOKE FIXTURE — not real data)\n\n"
            f"Name: {FAKE_NAME}\n"
            f"NRIC: {FAKE_NRIC}\n"
        )
        page.insert_text((72, 72), text, fontsize=12)
    doc.save(path)
    doc.close()


def main() -> None:
    SAMPLES_DIR.mkdir(exist_ok=True)
    _make_simple_text_pdf(SAMPLES_DIR / "smoke_text.pdf")
    _make_text_with_image_pdf(SAMPLES_DIR / "smoke_text_image.pdf")
    _make_multipage_pdf(SAMPLES_DIR / "smoke_multipage.pdf")
    print(f"Wrote smoke fixtures to {SAMPLES_DIR}/")


if __name__ == "__main__":
    main()
