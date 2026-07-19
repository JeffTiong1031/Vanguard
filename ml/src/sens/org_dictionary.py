"""Exact-match organisation dictionary — proposals the stock NER does not make.

🔴 Why this exists, measured 2026-07-19. After span repair, the residual failures are almost
entirely NER *blindness*, and the blind spots are recognisable companies: `Proton`, `TNB`,
`腾讯`, `阿里巴巴`, `字节跳动`, and `Boeing` in an English sentence. The same entity is
sometimes tagged and sometimes not, so it is instability rather than a fixed gap. A dictionary
is the precise instrument for exactly this class (ADR 0004).

Measured on the exam, with a dictionary derived only from the TRAINING set — covering just
51% of the exam's organisations:

    full MASK coverage   88.7% -> 93.2%
    complete blind spots  6.4% ->  2.3%
    Chinese              79.1% -> 89.6%

Production should do better than that estimate, not worse: ADR 0004's dictionary holds the
tenant's OWN counterparties — the vendors, clients and partners a company actually transacts
with — and those are precisely the organisations whose mention is sensitive.

**Exact match only.** ADR 0004 forbids fuzzy matching in Phase 0: fuzzy matching reintroduces
false positives into the one layer whose entire value is its precision, and precision is
quasi-contractual under ADR 0001.
"""
from __future__ import annotations

import re

Span = tuple[int, int]

_LATIN_START = re.compile(r"^[A-Za-z0-9]")


def _is_word_boundary(text: str, start: int, end: int, term: str) -> bool:
    """Latin terms need boundaries; CJK is written without spaces so it has none.

    Without this, `Grab` matches inside `Grabbed` and the dictionary becomes a false-positive
    generator — the exact failure ADR 0004's exact-match rule exists to avoid.
    """
    if not _LATIN_START.match(term):
        return True
    if start > 0 and (text[start - 1].isalnum() or text[start - 1] == "_"):
        return False
    if end < len(text) and (text[end].isalnum() or text[end] == "_"):
        return False
    return True


def normalise_terms(terms: list[str]) -> list[str]:
    """Deduplicate, drop blanks, and order longest-first.

    Longest-first matters: with both `Maju Trading` and `Maju Trading Sdn Bhd` present, the
    longer entry must win, or the masked span stops short of the full legal name.
    """
    seen: set[str] = set()
    out: list[str] = []
    for t in sorted((t.strip() for t in terms if t and t.strip()), key=len, reverse=True):
        if t.lower() not in seen:
            seen.add(t.lower())
            out.append(t)
    return out


def find_terms(text: str, terms: list[str]) -> list[Span]:
    """Every exact, boundary-respecting occurrence of any term. Case-sensitive.

    Case-sensitive is deliberate: `apple` in "an apple a day" is not Apple Inc, and a
    case-insensitive dictionary would mask ordinary words. Enter each casing you mean.
    """
    spans: list[Span] = []
    for term in terms:
        start = 0
        while True:
            i = text.find(term, start)
            if i == -1:
                break
            end = i + len(term)
            if _is_word_boundary(text, i, end, term):
                spans.append((i, end))
            start = i + 1
    return sorted(set(spans))


def propose(text: str, terms: list[str], ner_spans: list[Span] | None = None) -> list[Span]:
    """Dictionary hits, to be unioned with the NER's proposals.

    Returns the combined list; `span_repair.repair_spans` should still run afterwards, since
    a dictionary hit can also need a title or tail pulled in.
    """
    hits = find_terms(text, terms)
    return sorted(set(list(ner_spans or []) + hits))
