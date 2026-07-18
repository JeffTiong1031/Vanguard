import pytest
from pydantic import ValidationError
from sens.schema import Example, Span, assert_spans_valid


def _ex(**kw):
    base = dict(id="x", text="t", lang="en", spans=[], provenance="llm_synthetic", split="train")
    base.update(kw)
    return Example(**base)


def test_keep_and_mask_spans_both_valid():
    ex = _ex(
        text="Explain Einstein's theory to Ahmad bin Ali.",
        spans=[
            Span(start=8, end=16, surface="Einstein", entity_type="PER", label="KEEP"),
            Span(start=29, end=42, surface="Ahmad bin Ali", entity_type="PER", label="MASK"),
        ],
    )
    assert_spans_valid(ex)
    assert ex.spans[0].label == "KEEP"
    assert ex.spans[1].label == "MASK"


def test_surface_mismatch_raises():
    ex = _ex(text="Hello Einstein", spans=[Span(start=6, end=14, surface="Wrong", entity_type="PER", label="KEEP")])
    with pytest.raises(ValueError, match="surface"):
        assert_spans_valid(ex)


def test_end_not_after_start_raises():
    with pytest.raises(ValidationError):
        Span(start=5, end=5, surface="", entity_type="PER", label="KEEP")


def test_rejects_id_entity_type():
    with pytest.raises(ValidationError):
        Span(start=0, end=1, surface="x", entity_type="ID", label="MASK")  # type: ignore[arg-type]


def test_rejects_unknown_provenance():
    with pytest.raises(ValidationError):
        _ex(provenance="mystery")  # type: ignore[arg-type]


def test_rejects_overlapping_spans():
    # nested/overlapping marker regions would corrupt single-span marking (Task 7) — reject at validate
    ex = _ex(
        text="Ahmad bin Ali called.",
        spans=[
            Span(start=0, end=13, surface="Ahmad bin Ali", entity_type="PER", label="MASK"),
            Span(start=6, end=13, surface="bin Ali", entity_type="PER", label="MASK"),
        ],
    )
    with pytest.raises(ValueError, match="overlap"):
        assert_spans_valid(ex)
