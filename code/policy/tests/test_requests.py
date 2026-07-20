import uuid

from fastapi.testclient import TestClient

from app.main import app, bootstrap_demo
from app.deps import get_conn
from app.security import new_token, now_iso

client = TestClient(app)


def _pseudo_id(department: str = "Engineering") -> str:
    org_id = bootstrap_demo()
    plain, hashed = new_token("ENG")
    get_conn().execute(
        "INSERT INTO enroll_tokens (id, org_id, department, token_hash, label, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (uuid.uuid4().hex, org_id, department, hashed, department, now_iso()),
    )
    get_conn().commit()
    return client.post("/v1/enroll", json={"token": plain}).json()["pseudo_id"]


def test_a_request_is_created_pending():
    pid = _pseudo_id()
    r = client.post("/v1/requests", json={
        "pseudo_id": pid, "llm_id": "google", "reason": "Need it for translation QA",
    })
    assert r.status_code == 201
    assert r.json()["status"] == "pending"


def test_requesting_an_unknown_tool_is_404():
    pid = _pseudo_id()
    r = client.post("/v1/requests", json={
        "pseudo_id": pid, "llm_id": "not-a-tool", "reason": "x",
    })
    assert r.status_code == 404
    # A routing 404 (wrong path) would say "Not Found" -- this must be the
    # handler's own unknown-tool rejection, not a mistyped route.
    assert r.json()["detail"] == "unknown tool"


def test_requesting_with_an_unknown_pseudo_id_is_401():
    r = client.post("/v1/requests", json={
        "pseudo_id": "not-a-real-pseudo-id", "llm_id": "google", "reason": "x",
    })
    assert r.status_code == 401


def test_a_duplicate_pending_request_does_not_create_a_second_row():
    pid = _pseudo_id()
    payload = {"pseudo_id": pid, "llm_id": "google", "reason": "again"}
    first = client.post("/v1/requests", json=payload).json()["id"]
    second = client.post("/v1/requests", json=payload).json()["id"]
    assert first == second

    rows = get_conn().execute(
        "SELECT id FROM access_requests WHERE id = ?", (first,)
    ).fetchall()
    all_rows = get_conn().execute(
        "SELECT access_requests.id FROM access_requests"
        " JOIN employees ON employees.id = access_requests.employee_id"
        " WHERE employees.pseudo_id = ? AND access_requests.llm_id = ?",
        (pid, "google"),
    ).fetchall()
    assert len(all_rows) == 1
    assert len(rows) == 1


def test_an_overlong_reason_is_rejected():
    pid = _pseudo_id()
    r = client.post("/v1/requests", json={
        "pseudo_id": pid, "llm_id": "google", "reason": "x" * 501,
    })
    assert r.status_code == 422


def test_the_422_body_does_not_echo_the_reason_text():
    pid = _pseudo_id()
    secret = "SECRET-" + ("y" * 501)
    r = client.post("/v1/requests", json={
        "pseudo_id": pid, "llm_id": "google", "reason": secret,
    })
    assert r.status_code == 422
    assert "SECRET" not in r.text
