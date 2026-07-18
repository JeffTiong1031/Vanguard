"""U30 -- pikepdf alternate probe for in-place PDF text redaction.

pikepdf has no mature redact API (no search_for + apply_redactions). This probe
uses content-stream parsing: locate text-showing operators (Tj/TJ/…), drop or
edit operands that contain target spans, then verify with pdfminer.six.

🔴 Honest limits (documented in README):
- Works when spans appear as literal strings in content streams (smoke fixtures).
- Fails on ligatures, hyphenation, split operators, subset fonts, Form XObject
  text in real producer PDFs — the gap U30 exists to measure on real corpus.
- Covering with rectangles is NOT attempted; that would be mask-not-remove.

Licensing: pikepdf (MPL-2.0) + pdfminer.six (MIT) only — no PyMuPDF in this probe.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pikepdf
from pdfminer.high_level import extract_text

TEXT_OPS = {
    pikepdf.Operator("Tj"),
    pikepdf.Operator("'"),
    pikepdf.Operator('"'),
    pikepdf.Operator("TJ"),
}


def _pdf_string_bytes(obj: object) -> bytes | None:
    if isinstance(obj, (str, bytes)):
        return obj.encode("latin-1") if isinstance(obj, str) else obj
    if isinstance(obj, pikepdf.String):
        return bytes(obj)
    return None


def _decode_pdf_string(raw: bytes) -> str:
    try:
        return raw.decode("utf-16-be") if raw[:2] in (b"\xfe\xff", b"\xff\xfe") else raw.decode("latin-1", "replace")
    except Exception:
        return raw.decode("latin-1", "replace")


def _extract_instruction_text(instr: pikepdf.ContentStreamInstruction) -> str:
    parts: list[str] = []
    for operand in instr.operands:
        raw = _pdf_string_bytes(operand)
        if raw is not None:
            parts.append(_decode_pdf_string(raw))
        elif isinstance(operand, pikepdf.Array):
            for item in operand:
                raw = _pdf_string_bytes(item)
                if raw is not None:
                    parts.append(_decode_pdf_string(raw))
    return "".join(parts)


def _replace_in_pdf_string(raw: bytes, span: str) -> bytes | None:
    text = _decode_pdf_string(raw)
    if span not in text:
        return None
    new_text = text.replace(span, "")
    if raw[:2] == b"\xfe\xff":
        return new_text.encode("utf-16-be")
    return new_text.encode("latin-1", "replace")


def _edit_operands_remove_span(operands: list, span: str) -> tuple[list, bool]:
    changed = False
    new_ops: list = []
    for operand in operands:
        raw = _pdf_string_bytes(operand)
        if raw is not None:
            replaced = _replace_in_pdf_string(raw, span)
            if replaced is not None:
                changed = True
                if replaced:
                    new_ops.append(pikepdf.String(replaced))
                continue
            new_ops.append(operand)
        elif isinstance(operand, pikepdf.Array):
            new_arr: list = []
            for item in operand:
                raw = _pdf_string_bytes(item)
                if raw is not None:
                    replaced = _replace_in_pdf_string(raw, span)
                    if replaced is not None:
                        changed = True
                        if replaced:
                            new_arr.append(pikepdf.String(replaced))
                        continue
                    new_arr.append(item)
                else:
                    new_arr.append(item)
            if new_arr:
                new_ops.append(pikepdf.Array(new_arr))
        else:
            new_ops.append(operand)
    return new_ops, changed


def _count_span_hits_in_instructions(
    instructions: list[pikepdf.ContentStreamInstruction], spans: list[str]
) -> dict[str, int]:
    hits = {s: 0 for s in spans}
    for instr in instructions:
        if instr.operator not in TEXT_OPS:
            continue
        text = _extract_instruction_text(instr)
        for span in spans:
            if span in text:
                hits[span] += 1
    return hits


def _redact_instructions(
    instructions: list[pikepdf.ContentStreamInstruction], spans: list[str]
) -> list[pikepdf.ContentStreamInstruction]:
    out: list[pikepdf.ContentStreamInstruction] = []
    for instr in instructions:
        if instr.operator not in TEXT_OPS:
            out.append(instr)
            continue
        text = _extract_instruction_text(instr)
        if not any(span in text for span in spans):
            out.append(instr)
            continue
        new_ops = list(instr.operands)
        removed_any = False
        for span in spans:
            if span not in text:
                continue
            new_ops, changed = _edit_operands_remove_span(new_ops, span)
            if changed:
                removed_any = True
                text = _extract_instruction_text(
                    pikepdf.ContentStreamInstruction(new_ops, instr.operator)
                )
        if removed_any and _extract_instruction_text(
            pikepdf.ContentStreamInstruction(new_ops, instr.operator)
        ).strip():
            out.append(pikepdf.ContentStreamInstruction(new_ops, instr.operator))
        elif not removed_any:
            out.append(instr)
    return out


def _collect_all_instructions(
    pdf: pikepdf.Pdf, page: pikepdf.Page
) -> list[tuple[object, list[pikepdf.ContentStreamInstruction]]]:
    """Return (container, instructions) for page Contents and text Form XObjects."""
    blocks: list[tuple[object, list[pikepdf.ContentStreamInstruction]]] = []
    blocks.append((page, pikepdf.parse_content_stream(page)))

    resources = page.get("/Resources", None)
    if resources is None:
        return blocks
    xobjects = resources.get("/XObject", None)
    if xobjects is None:
        return blocks

    for _name, xobj in xobjects.items():
        if xobj.get("/Subtype") == "/Form":
            try:
                blocks.append((xobj, pikepdf.parse_content_stream(xobj)))
            except Exception:
                pass
    return blocks


def _write_instructions(container: object, pdf: pikepdf.Pdf, instructions: list) -> None:
    stream = pdf.make_stream(pikepdf.unparse_content_stream(instructions))
    if isinstance(container, pikepdf.Page):
        container.Contents = stream
    else:
        container.write(stream, filter=pikepdf.Name("/FlateDecode"))


def count_images(pdf: pikepdf.Pdf) -> int:
    total = 0
    for page in pdf.pages:
        total += len(page.get_images())
    return total


def count_hits(pdf: pikepdf.Pdf, spans: list[str]) -> dict[str, int]:
    hits = {s: 0 for s in spans}
    for page in pdf.pages:
        for _container, instructions in _collect_all_instructions(pdf, page):
            page_hits = _count_span_hits_in_instructions(instructions, spans)
            for span, n in page_hits.items():
                hits[span] += n
    return hits


def extract_text_pdfminer(path: Path) -> str:
    return extract_text(str(path)) or ""


def redact(path: Path, spans: list[str], out: Path) -> dict:
    with pikepdf.open(path) as doc:
        images_before = count_images(doc)
        hits = count_hits(doc, spans)

        for page in doc.pages:
            for container, instructions in _collect_all_instructions(doc, page):
                redacted = _redact_instructions(instructions, spans)
                _write_instructions(container, doc, redacted)

        doc.remove_unreferenced_resources()
        doc.save(out)

    with pikepdf.open(out) as doc_after:
        images_after = count_images(doc_after)

    residual = extract_text_pdfminer(out)
    still_present = [s for s in spans if s in residual]
    missed = [s for s, n in hits.items() if n == 0]

    return {
        "library": "pikepdf",
        "hits": hits,
        "missed": missed,
        "still_present": still_present,
        "images_before": images_before,
        "images_after": images_after,
    }


if __name__ == "__main__":
    src = Path(sys.argv[1])
    spans = sys.argv[2:]
    result = redact(src, spans, src.with_suffix(".pikepdf.redacted.pdf"))
    for key, value in result.items():
        print(f"{key}: {value}")
