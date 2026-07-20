"""A minimal guard on I3: event models must reject fields they don't declare.

This is not the full model test suite -- that arrives in Task 7. It exists
because this task's own self-review question is "would the test still pass if
extra='forbid' were removed from UsageEvent?" and the brief's Step 1 test
(test_app.py::test_healthz) never touches app.models at all, so the answer
would be yes. This closes that gap for the one line the brief calls out as
most important, without duplicating Task 7's scope.
"""
import pytest
from pydantic import ValidationError

from app.models import UsageEvent


def test_usage_event_rejects_a_field_it_does_not_declare():
    """A client trying to smuggle prompt text in gets a 422, not silence."""
    with pytest.raises(ValidationError):
        UsageEvent(
            host="chatgpt.com",
            type="pii_block",
            ts="2026-07-20T00:00:00Z",
            prompt="this should never be accepted",
        )


def test_usage_event_finding_hash_must_be_64_hex_chars():
    with pytest.raises(ValidationError):
        UsageEvent(host="chatgpt.com", type="pii_block", ts="t", finding_hash="not-hex")

    # Accepted: exactly 64 hex chars.
    ok = UsageEvent(host="chatgpt.com", type="pii_block", ts="t", finding_hash="a" * 64)
    assert ok.finding_hash == "a" * 64
