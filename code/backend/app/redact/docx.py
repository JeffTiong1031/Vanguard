"""Apply accepted masks to the ORIGINAL DOCX.

The extract's NodeRef map says which w:t node each extract character came
from, so a span becomes a set of (node, local range) edits. Everything not
edited -- styles, tables, headers, and every byte under word/media/ -- is
copied through untouched.
"""
import io
import zipfile
from xml.etree import ElementTree

from app.models import ErrorCode, RedactSpan
from app.parsers.text import NodeRef
from app.safety import SafetyError

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
ElementTree.register_namespace(
    "w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
)


def redact_docx(data: bytes, spans: list[RedactSpan], nodes: list[NodeRef]) -> bytes:
    # part -> node_index -> list of (local_start, local_end, replacement)
    edits: dict[str, dict[int, list[tuple[int, int, str]]]] = {}

    for span in spans:
        touched = [
            n for n in nodes
            if n.extract_start < span.end and n.extract_start + n.length > span.start
        ]
        if not touched:
            raise SafetyError(
                ErrorCode.REDACTION_FAILED,
                f'Vanguard could not apply the mask for "{span.text}" to this document, '
                "so nothing was changed and the file has not been sent to the AI.",
            )

        for position, node in enumerate(touched):
            local_start = max(0, span.start - node.extract_start)
            local_end = min(node.length, span.end - node.extract_start)
            replacement = span.placeholder if position == 0 else ""
            edits.setdefault(node.part, {}).setdefault(node.node_index, []).append(
                (local_start, local_end, replacement)
            )

    source = zipfile.ZipFile(io.BytesIO(data))
    out_buffer = io.BytesIO()

    with zipfile.ZipFile(out_buffer, "w", zipfile.ZIP_DEFLATED) as out:
        for item in source.infolist():
            payload = source.read(item.filename)
            if item.filename in edits:
                payload = _rewrite_part(payload, edits[item.filename])
            out.writestr(item, payload)

    return out_buffer.getvalue()


def _rewrite_part(part: bytes, by_node: dict[int, list[tuple[int, int, str]]]) -> bytes:
    root = ElementTree.fromstring(part)
    t_index = 0
    for node in root.iter():
        if node.tag != f"{W_NS}t":
            continue
        ranges = by_node.get(t_index)
        if ranges and node.text:
            text = node.text
            for local_start, local_end, replacement in sorted(ranges, reverse=True):
                text = text[:local_start] + replacement + text[local_end:]
            node.text = text
            node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t_index += 1
    return ElementTree.tostring(root, encoding="UTF-8", xml_declaration=True)
