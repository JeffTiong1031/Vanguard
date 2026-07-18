from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

EntityType = Literal["PER", "ORG"]
Label = Literal["MASK", "KEEP"]
Provenance = Literal["llm_synthetic", "human_simulated", "real"]
Split = Literal["train", "dev", "eval"]
Lang = Literal["en", "bm", "zh", "mixed"]


class Span(BaseModel):
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    surface: str
    entity_type: EntityType
    label: Label

    @field_validator("end")
    @classmethod
    def _end_gt_start(cls, end: int, info):
        start = info.data.get("start")
        if start is not None and end <= start:
            raise ValueError("end must be > start")
        return end


class Example(BaseModel):
    id: str
    text: str
    lang: Lang
    spans: list[Span] = Field(default_factory=list)
    provenance: Provenance
    split: Split
    source: str = "unknown"
    tags: list[str] = Field(default_factory=list)


def assert_spans_valid(example: Example) -> None:
    n = len(example.text)
    for sp in example.spans:
        if sp.end > n:
            raise ValueError(f"{example.id}: span end {sp.end} exceeds text length {n}")
        sliced = example.text[sp.start : sp.end]
        if sliced != sp.surface:
            raise ValueError(f"{example.id}: surface mismatch {sp.surface!r} != {sliced!r}")
    # Reject overlapping/nested spans: each span is marked independently (Task 7), and two markers
    # inside one another produce a corrupt input. NER emits disjoint PER/ORG spans in practice.
    ordered = sorted(example.spans, key=lambda s: (s.start, s.end))
    for a, b in zip(ordered, ordered[1:]):
        if b.start < a.end:
            raise ValueError(
                f"{example.id}: overlapping spans ({a.start},{a.end}) and ({b.start},{b.end})"
            )
