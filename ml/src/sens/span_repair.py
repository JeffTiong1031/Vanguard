"""Repair stock-NER span boundaries before classification.

🔴 Why this exists. Measured 2026-07-19 over the exam: a stock multilingual NER covers only
**64.3%** of MASK spans in full. The gap is not mostly blindness — it is a *definition*
mismatch. The NER proposes `Rahman`, `鲁迅`, `Acme Corp`; the rubric requires the honorific
INSIDE the masked span (doc 04 §4.3), so gold is `Encik Rahman`, `鲁迅先生`. A span that
covers half an entity is not a partial success: masking `阿` and leaving `里巴巴` in the
prompt is a leak with a receipt, and `Encik ____` is a re-identification pointer.

Applying `repair_spans` lifted full MASK coverage from **0.643 to 0.859** on the exam — a
larger gain than every classifier training round in this track combined, from deterministic
rules with no model involved.

Cost, measured on the same run: 3.5% of repaired spans over-extend, by a role or department
word (`会计部的张先生` for `张先生`, `Vendor Acme Corp` for `Acme Corp`). That is a utility
cost, not a privacy failure — the wider span is still sensitive — and it is the right side to
err on.

⚠️ The title lists are the instrument here, and an incomplete list silently understates the
gain: this session had honorific counts reported as 5, 8 and 22 for one file before the list
was completed. Treat them as maintained data, not as constants that are finished.
"""
from __future__ import annotations

Span = tuple[int, int]

# Latin-script titles that PRECEDE the name. Longest-first so "Dato' Seri" wins over "Dato".
#
# 🔴 Provenance rule for this list: entries are attested in the TRAINING set's gold spans
# (>= 2 distinct spans) or are general linguistic knowledge. They are NOT mined from the
# exam's failures. Tuning these against the exam is the same defect as training on it — the
# exam is the measuring instrument, and a ruler calibrated against the thing it measures
# reports nothing. `律师`, `主管`, `Chef`, `Uncle`, `Laksamana` were observed failing on the
# exam and are deliberately ABSENT: they do not occur in training, so there is no independent
# evidence for them.
LEADING_TITLES: tuple[str, ...] = (
    "Dato' Seri", "Datuk Seri", "Dato Seri", "Tan Sri", "Tun Dr.", "Dato'", "Datuk", "Datin",
    "Dato", "Tun", "Tunku", "Sultan", "Encik", "Puan", "Cikgu", "Cik", "Tuan", "Sir",
    "Professor", "Prof.", "Prof", "Dr.", "Mr.", "Mrs.", "Ms.", "Miss", "Madam", "En.",
    "Director", "Pengarah",
)

# CJK titles that FOLLOW the name.
TRAILING_TITLES: tuple[str, ...] = (
    "先生", "女士", "小姐", "太太", "总经理", "经理", "主任", "博士", "老板", "局长",
    "长官", "大人", "老师", "医生", "总",
)

# ORG name tails. A stock NER stops at the recognisable core (`Unilever`, `华为`) and drops
# the legal or descriptive tail, so the masked span leaves part of the organisation visible.
# Same provenance rule as above: attested in training gold spans.
ORG_TAILS: tuple[str, ...] = (
    "Sdn Bhd", "Sdn. Bhd.", "Corporation", "Enterprise", "Electronics", "Solutions",
    "Logistics", "Holdings", "Company", "Partner", "Group", "Corp", "Bank", "Bhd", "Ltd",
    "有限公司", "供应链伙伴", "科技公司", "公司", "集团", "企业", "贸易", "工业", "伙伴",
)

# How far past a span to look for an ORG tail. Bounded so a tail belonging to a DIFFERENT
# organisation later in the sentence cannot be swept in.
ORG_TAIL_LOOKAHEAD = 12


def merge_spans(spans: list[Span], gap: int = 0) -> list[Span]:
    """Union overlapping spans; `gap` also joins spans separated by that many characters.

    gap=0 is the default deliberately. Bridging bought +0.4pp and caused most of the
    over-extension (it joins a department ORG to an adjacent PER), so the wider setting
    is available but not the default.
    """
    if not spans:
        return []
    ordered = sorted(spans)
    out: list[list[int]] = [list(ordered[0])]
    for start, end in ordered[1:]:
        if start <= out[-1][1] + gap:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return [(a, b) for a, b in out]


def expand_titles(spans: list[Span], text: str) -> list[Span]:
    """Grow each span outward over an attached honorific, per doc 04 §4.3."""
    grown: list[Span] = []
    for start, end in spans:
        before = text[:start]
        stripped = before.rstrip()
        pad = len(before) - len(stripped)
        for title in LEADING_TITLES:
            if stripped.endswith(title):
                # only if the title is itself a word boundary, not a suffix of a longer word
                cut = len(stripped) - len(title)
                if cut == 0 or not stripped[cut - 1].isalnum():
                    start = cut
                    break
        else:
            pad = 0
        for title in TRAILING_TITLES:
            if text[end:end + len(title)] == title:
                end += len(title)
                break
        grown.append((start, end))
    return merge_spans(grown)


def expand_org_tails(spans: list[Span], text: str) -> list[Span]:
    """Extend a span forward over an organisation tail it stopped short of.

    `Unilever` for `Unilever Malaysia`, `华为` for `华为供应链伙伴`: the NER stops at the
    recognisable core and the masked span leaves the rest of the name in the prompt.

    The lookahead is bounded and the text between the span and the tail must be short and
    unbroken — no sentence punctuation — so a tail belonging to a different organisation
    later in the sentence cannot be absorbed.
    """
    grown: list[Span] = []
    for start, end in spans:
        window = text[end:end + ORG_TAIL_LOOKAHEAD]
        best_end = end
        for tail in ORG_TAILS:
            idx = window.find(tail)
            if idx == -1:
                continue
            between = window[:idx]
            if any(ch in between for ch in ".,;!?，。；！？、\n"):
                continue
            candidate = end + idx + len(tail)
            if candidate > best_end:
                best_end = candidate
        grown.append((start, best_end))
    return merge_spans(grown)


def repair_spans(spans: list[Span], text: str, gap: int = 0) -> list[Span]:
    """merge -> titles -> org tails -> merge again (expansion can create new overlaps)."""
    merged = merge_spans(spans, gap=gap)
    return merge_spans(expand_org_tails(expand_titles(merged, text), text))


def coverage(gold_start: int, gold_end: int, spans: list[Span]) -> float:
    """Fraction of a gold span's characters covered by any of `spans`.

    Partial coverage counts as a miss for masking: the value is protected only if all of it
    is replaced. Over-long spans are not penalised — extra masking costs utility, not privacy.
    """
    if gold_end <= gold_start:
        return 0.0
    covered: set[int] = set()
    for start, end in spans:
        covered.update(range(max(start, gold_start), min(end, gold_end)))
    return len(covered) / (gold_end - gold_start)
