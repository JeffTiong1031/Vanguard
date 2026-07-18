from sens.schema import Example, Span
from sens.disagreement import disagreement_rate, disagreement_by_lang


def _ex(id, lang, label):
    return Example(id=id, text="ab", lang=lang, provenance="llm_synthetic", split="train",
                   spans=[Span(start=0, end=1, surface="a", entity_type="PER", label=label)])


def test_overall_rate():
    a = [_ex("1", "en", "MASK"), _ex("2", "bm", "KEEP")]
    b = [_ex("1", "en", "KEEP"), _ex("2", "bm", "KEEP")]  # differ on id 1
    assert disagreement_rate(a, b) == 0.5


def test_by_lang():
    a = [_ex("1", "en", "MASK"), _ex("2", "bm", "MASK")]
    b = [_ex("1", "en", "MASK"), _ex("2", "bm", "KEEP")]
    d = disagreement_by_lang(a, b)
    assert d["en"] == 0.0
    assert d["bm"] == 1.0
