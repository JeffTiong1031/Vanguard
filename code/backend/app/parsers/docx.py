"""DOCX text extraction over the OOXML parts directly.

🔴 Deliberately NOT python-docx. Its paragraph iterator walks the main body
only -- headers, footers, footnotes, endnotes and comments are invisible to
it. An NRIC in a Word comment would then be unseen by us and seen by the
provider: a silent fail-open in the exact shape doc 00 section 6 calls the
worst case for a compliance buyer.
"""
import io
import re
import zipfile
from xml.etree import ElementTree

from app.models import Coverage, ErrorCode
from app.parsers.text import ExtractResult, NodeRef
from app.safety import SafetyError

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# part-name pattern -> the label used in Coverage.read
PART_GROUPS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^word/document\.xml$"), "body"),
    (re.compile(r"^word/header\d*\.xml$"), "headers"),
    (re.compile(r"^word/footer\d*\.xml$"), "footers"),
    (re.compile(r"^word/footnotes\.xml$"), "footnotes"),
    (re.compile(r"^word/endnotes\.xml$"), "endnotes"),
    (re.compile(r"^word/comments\.xml$"), "comments"),
]


def _text_of(part_name: str, part: bytes, base: int) -> tuple[str, list[NodeRef]]:
    """Extract text AND record where each w:t node's characters landed.

    `node_index` counts w:t nodes in document order within this part -- the
    same order Task 12's rewriter walks them in. The two must agree, so both
    use `root.iter()` and neither filters.
    """
    try:
        root = ElementTree.fromstring(part)
    except ElementTree.ParseError:
        return "", []

    pieces: list[str] = []
    refs: list[NodeRef] = []
    cursor = base
    t_index = 0

    for node in root.iter():
        if node.tag == f"{W_NS}t":
            body = node.text or ""
            if body:
                refs.append(NodeRef(part_name, t_index, cursor, len(body)))
                pieces.append(body)
                cursor += len(body)
            t_index += 1
        elif node.tag == f"{W_NS}tab":
            pieces.append("\t")
            cursor += 1
        elif node.tag in (f"{W_NS}br", f"{W_NS}p"):
            pieces.append("\n")
            cursor += 1

    return "".join(pieces), refs


def parse_docx(data: bytes) -> ExtractResult:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise SafetyError(
            ErrorCode.PARSE_FAILED,
            "This Word file looks damaged and could not be opened. It has not "
            "been sent to the AI.",
        ) from exc

    names = archive.namelist()

    # An encrypted OOXML file is an OLE container, not a ZIP with word/ parts.
    if "word/document.xml" not in names:
        raise SafetyError(
            ErrorCode.PASSWORD_PROTECTED,
            "This Word file appears to be password-protected, so it could not "
            "be checked. It has not been sent to the AI. Please remove the "
            "password and try again.",
        )

    chunks: list[str] = []
    refs: list[NodeRef] = []
    read: list[str] = []
    cursor = 0

    for pattern, label in PART_GROUPS:
        matched = sorted(n for n in names if pattern.match(n))
        if not matched:
            continue
        read.append(label)
        for name in matched:
            body, part_refs = _text_of(name, archive.read(name), cursor)
            if not body.strip():
                continue
            chunks.append(body)
            refs.extend(part_refs)
            cursor += len(body) + 1     # +1 for the "\n" join below

    images = [n for n in names if n.startswith("word/media/")]
    not_read = [f"{len(images)} embedded images (no OCR)"] if images else []

    return "\n".join(chunks), Coverage(read=read, not_read=not_read), [], refs
