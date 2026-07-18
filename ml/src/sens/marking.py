from __future__ import annotations

from collections.abc import Iterator

from sens.schema import Example, Span

E_OPEN = "[E]"
E_CLOSE = "[/E]"


def mark_span(text: str, span: Span) -> str:
    """Wrap the target span in marker tokens, preserving both-sided context."""
    return f"{text[: span.start]}{E_OPEN} {span.surface} {E_CLOSE}{text[span.end :]}"


def iter_span_instances(example: Example) -> Iterator[tuple[str, str, str]]:
    """One classification instance per span: (marked_text, label, entity_type)."""
    for sp in example.spans:
        yield mark_span(example.text, sp), sp.label, sp.entity_type
