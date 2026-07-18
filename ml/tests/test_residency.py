import pytest
from sens.schema import Example
from sens.residency import assert_no_eval_in_train, assert_upload_allowed, counsel_gate_required


def _ex(split, provenance="llm_synthetic", id="x"):
    return Example(id=id, text="t", lang="en", spans=[], provenance=provenance, split=split)


def test_eval_row_in_training_raises():
    with pytest.raises(ValueError, match="eval"):
        assert_no_eval_in_train([_ex("train"), _ex("eval", id="leak")])


def test_train_only_ok():
    assert_no_eval_in_train([_ex("train"), _ex("dev")]) is None


def test_real_to_colab_refused():
    with pytest.raises(ValueError, match="local MY|MY-region"):
        assert_upload_allowed([_ex("train", provenance="real")], target="colab")


def test_synthetic_to_colab_ok():
    assert_upload_allowed([_ex("train", provenance="llm_synthetic")], target="colab") is None


def test_real_to_local_ok():
    assert_upload_allowed([_ex("eval", provenance="real")], target="local_my") is None


def test_counsel_gate_triggers_on_real():
    assert counsel_gate_required([_ex("eval", provenance="real")]) is True
    assert counsel_gate_required([_ex("eval", provenance="human_simulated")]) is False
