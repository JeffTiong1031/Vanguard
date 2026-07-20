import uuid

from fastapi.testclient import TestClient

from app.main import app, bootstrap_demo, get_conn
from app.security import new_token, now_iso

client = TestClient(app)


def _mint(department: str) -> str:
    org_id = bootstrap_demo()
    plain, hashed = new_token(department[:3])
    get_conn().execute(
        "INSERT INTO enroll_tokens (id, org_id, department, token_hash, label, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (uuid.uuid4().hex, org_id, department, hashed, department, now_iso()),
    )
    get_conn().commit()
    return plain


def test_enrol_returns_the_department_from_the_token_not_the_client():
    token = _mint("Engineering")
    r = client.post("/v1/enroll", json={"token": token})
    assert r.status_code == 200
    body = r.json()
    assert body["department"] == "Engineering"
    assert body["policy"]["version"] >= 1
    assert any(t["host"] == "chatgpt.com" and t["status"] == "approved"
               for t in body["policy"]["tools"])


def test_enrol_mints_a_distinct_pseudo_id_each_time():
    token = _mint("Engineering")
    a = client.post("/v1/enroll", json={"token": token}).json()["pseudo_id"]
    b = client.post("/v1/enroll", json={"token": token}).json()["pseudo_id"]
    assert a != b


def test_a_bad_token_is_401():
    assert client.post("/v1/enroll", json={"token": "ENG-nope"}).status_code == 401


def test_a_revoked_token_is_401():
    token = _mint("Finance")
    get_conn().execute("UPDATE enroll_tokens SET revoked = 1")
    get_conn().commit()
    assert client.post("/v1/enroll", json={"token": token}).status_code == 401


def test_the_client_cannot_choose_its_own_department():
    token = _mint("Engineering")
    r = client.post("/v1/enroll", json={"token": token, "department": "Executive"})
    assert r.status_code == 422  # extra="forbid"


def test_department_from_body_is_rejected_not_silently_ignored():
    """Stronger than a bare 422: prove the request never reached the handler.

    If the route accidentally read `department` off the body (instead of the
    token) this would still be caught by pydantic's extra="forbid" -- but only
    because the field name happens to collide with a model field. This test
    pins the *reason* for the 422: the body is rejected at validation, before
    any department lookup happens, by asserting the response is a pydantic
    validation error shape, not an application-level rejection.
    """
    token = _mint("Engineering")
    r = client.post("/v1/enroll", json={"token": token, "department": "Executive"})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert any(e.get("type") == "extra_forbidden" for e in detail)


def test_pseudo_id_is_a_fresh_uuid4_not_derived_from_the_token():
    """Pin the randomness contract, not just "looks different across calls".

    A pseudo_id computed as e.g. sha256(token) would fail the "distinct each
    call" test (it's constant), but sha256(f"{token}:{call_count}") is
    DIFFERENT on every call while still being fully determined by public
    inputs (the token plus how many times it's been used) -- i.e. guessable,
    which defeats pseudonymity just as badly as a constant id. A 64-hex-char
    sha256 digest can never parse as a UUID, so asserting the id is a real
    UUIDv4 catches that whole family of "distinct but derived" mutants that
    an inequality check (a != b) alone would miss.
    """
    token = _mint("Engineering")
    a = client.post("/v1/enroll", json={"token": token}).json()["pseudo_id"]
    b = client.post("/v1/enroll", json={"token": token}).json()["pseudo_id"]
    for pid in (a, b):
        parsed = uuid.UUID(hex=pid)
        assert parsed.version == 4
    assert a != b


def test_two_different_tokens_same_department_get_different_pseudo_ids_and_correct_department():
    """Cross-check the department comes from each token's own row, not a shared default."""
    eng_token = _mint("Engineering")
    fin_token = _mint("Finance")
    eng = client.post("/v1/enroll", json={"token": eng_token}).json()
    fin = client.post("/v1/enroll", json={"token": fin_token}).json()
    assert eng["department"] == "Engineering"
    assert fin["department"] == "Finance"
    assert eng["pseudo_id"] != fin["pseudo_id"]
