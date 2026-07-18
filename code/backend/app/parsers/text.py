from dataclasses import dataclass

from app import limits
from app.models import Coverage


@dataclass(frozen=True)
class NodeRef:
    """A run of extract characters, and where in the source it came from.

    Task 12 walks these to apply an accepted mask to the ORIGINAL file rather
    than to a text copy of it. DOCX populates them; TXT/CSV and PDF return an
    empty list (the extract IS the file, and PDF redacts by search).
    """
    part: str
    node_index: int
    extract_start: int
    length: int


ExtractResult = tuple[str, Coverage, list[str], list[NodeRef]]


def truncate(text: str) -> tuple[str, bool]:
    if len(text) <= limits.MAX_EXTRACT_CHARS:
        return text, False
    return text[: limits.MAX_EXTRACT_CHARS], True


def parse_text(filename: str, data: bytes) -> ExtractResult:
    warnings: list[str] = []
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        # Never fail a scan on an encoding: a mis-decoded byte is still text we
        # can search, and refusing would push the user to attach it unchecked.
        text = data.decode("utf-8", errors="replace")
        warnings.append(
            "Some characters could not be decoded (unknown text encoding) "
            "and were replaced."
        )

    if filename.lower().endswith(".csv"):
        rows = text.splitlines()
        if len(rows) > limits.MAX_CSV_ROWS:
            text = "\n".join(rows[: limits.MAX_CSV_ROWS])
            warnings.append(
                f"Only the first {limits.MAX_CSV_ROWS:,} rows were checked."
            )

    return text, Coverage(read=["file text"], not_read=[]), warnings, []
