from sens.schema import Example, Span
from sens.marking import mark_span, iter_span_instances, E_OPEN, E_CLOSE


def test_mark_span_wraps_context_preserved():
    text = "Email Ahmad bin Ali today."
    sp = Span(start=6, end=19, surface="Ahmad bin Ali", entity_type="PER", label="MASK")
    marked = mark_span(text, sp)
    assert marked == f"Email {E_OPEN} Ahmad bin Ali {E_CLOSE} today."
    # context on both sides survives (the discriminator needs it)
    assert marked.startswith("Email ")
    assert marked.endswith(" today.")


def test_iter_instances_one_per_span():
    ex = Example(
        id="x",
        text="Explain Einstein to Ali.",
        lang="en",
        spans=[
            Span(start=8, end=16, surface="Einstein", entity_type="PER", label="KEEP"),
            Span(start=20, end=23, surface="Ali", entity_type="PER", label="MASK"),
        ],
        provenance="llm_synthetic",
        split="train",
    )
    out = list(iter_span_instances(ex))
    assert len(out) == 2
    assert out[0][1] == "KEEP" and out[1][1] == "MASK"
    assert E_OPEN in out[0][0] and E_OPEN in out[1][0]
