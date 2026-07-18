"""Generate hostile fixtures. Committed as a script, not as binaries."""
import io, zipfile
from pathlib import Path

HERE = Path(__file__).parent


def zip_bomb() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("word/document.xml", b"\0" * (200 * 1024 * 1024))
    return buf.getvalue()


def many_entries() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for i in range(5_000):
            z.writestr(f"f{i}.xml", b"x")
    return buf.getvalue()


def truncated_pdf() -> bytes:
    return b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n"  # no xref


def scanned_no_text() -> bytes:
    """A structurally valid 2-page PDF with no text operators at all."""
    from pypdf import PdfWriter

    w = PdfWriter()
    w.add_blank_page(width=595, height=842)
    w.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


if __name__ == "__main__":
    (HERE / "zip_bomb.docx").write_bytes(zip_bomb())
    (HERE / "many_entries.docx").write_bytes(many_entries())
    (HERE / "truncated.pdf").write_bytes(truncated_pdf())
    (HERE / "scanned_no_text.pdf").write_bytes(scanned_no_text())
    print("fixtures written to", HERE)
