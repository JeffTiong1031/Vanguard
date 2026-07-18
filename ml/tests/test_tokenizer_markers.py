# ml/tests/test_tokenizer_markers.py
import pytest

transformers = pytest.importorskip("transformers")  # skipped unless [train] extras installed
from sens.marking import E_OPEN, E_CLOSE  # noqa: E402


def test_markers_are_single_special_ids():
    tok = transformers.AutoTokenizer.from_pretrained("microsoft/mdeberta-v3-base")
    tok.add_special_tokens({"additional_special_tokens": [E_OPEN, E_CLOSE]})
    for marker in (E_OPEN, E_CLOSE):
        ids = tok.encode(marker, add_special_tokens=False)
        assert len(ids) == 1, f"{marker} fragmented into {ids} — SentencePiece did not treat it as special"
        assert ids[0] >= tok.vocab_size - 2 or ids[0] in tok.all_special_ids
