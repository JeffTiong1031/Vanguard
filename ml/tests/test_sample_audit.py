from sens.schema import Example, Span
from sens.sample_audit import stratified_sample


def _ex(i, lang, masked):
    spans = []
    text = f"hello {lang} {i}"
    if masked:
        spans = [Span(start=0, end=5, surface="hello", entity_type="PER", label="MASK")]
    else:
        spans = [Span(start=0, end=5, surface="hello", entity_type="PER", label="KEEP")]
    return Example(id=f"{lang}-{i}-{masked}", text=text, lang=lang, spans=spans,
                   provenance="llm_synthetic", split="train")


def test_sample_covers_langs_and_mask_buckets():
    pool = []
    for lang in ("en", "bm", "zh"):
        pool += [_ex(i, lang, False) for i in range(10)]
        pool += [_ex(i, lang, True) for i in range(10)]
    sample = stratified_sample(pool, n=12, seed=1)
    assert len(sample) == 12
    assert {e.lang for e in sample} == {"en", "bm", "zh"}
    assert any(any(s.label == "MASK" for s in e.spans) for e in sample)
    assert any(all(s.label == "KEEP" for s in e.spans) for e in sample)


def test_deterministic_by_seed():
    pool = [_ex(i, "en", i % 2 == 0) for i in range(20)]
    assert [e.id for e in stratified_sample(pool, 6, seed=3)] == [
        e.id for e in stratified_sample(pool, 6, seed=3)
    ]
