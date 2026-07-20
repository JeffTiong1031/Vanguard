from fastapi.testclient import TestClient

from app.main import app, bootstrap_demo, get_conn
from app.security import now_iso

client = TestClient(app)
SECRET = "Ahmad bin Ali 880101-14-5566"


def _enrolled_pseudo_id() -> str:
    import uuid
    from app.security import new_token
    org_id = bootstrap_demo()
    plain, hashed = new_token("ENG")
    get_conn().execute(
        "INSERT INTO enroll_tokens (id, org_id, department, token_hash, label, created_at)"
        " VALUES (?, ?, 'Engineering', ?, 'Engineering', ?)",
        (uuid.uuid4().hex, org_id, hashed, now_iso()),
    )
    get_conn().commit()
    return client.post("/v1/enroll", json={"token": plain}).json()["pseudo_id"]


def _event(**over):
    base = {"host": "gemini.google.com", "type": "visit_unapproved", "ts": now_iso()}
    base.update(over)
    return base


def test_a_valid_batch_is_accepted_and_stored():
    pid = _enrolled_pseudo_id()
    r = client.post("/v1/events", json={"pseudo_id": pid, "events": [_event()]})
    assert r.status_code == 202
    n = get_conn().execute(
        "SELECT COUNT(*) AS n FROM usage_events WHERE host = 'gemini.google.com'"
    ).fetchone()["n"]
    assert n >= 1


def test_an_event_carrying_prompt_text_is_REJECTED_not_silently_ignored():
    """I3. A field that is ignored today is a field someone stores tomorrow."""
    pid = _enrolled_pseudo_id()
    r = client.post("/v1/events", json={
        "pseudo_id": pid,
        "events": [_event(prompt=SECRET)],
    })
    assert r.status_code == 422


def test_a_non_hex_finding_hash_is_rejected():
    pid = _enrolled_pseudo_id()
    r = client.post("/v1/events", json={
        "pseudo_id": pid,
        "events": [_event(finding_hash=SECRET)],
    })
    assert r.status_code == 422


def test_no_event_payload_reaches_the_logs(caplog):
    import logging
    pid = _enrolled_pseudo_id()
    with caplog.at_level(logging.DEBUG):
        client.post("/v1/events", json={"pseudo_id": pid, "events": [_event()]})
    joined = "\n".join(r.getMessage() for r in caplog.records)
    assert SECRET not in joined
    assert "gemini.google.com" not in joined


def test_an_unknown_pseudo_id_is_401():
    r = client.post("/v1/events", json={"pseudo_id": "nope", "events": [_event()]})
    assert r.status_code == 401
