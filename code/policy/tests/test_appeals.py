from fastapi.testclient import TestClient
from app.main import app, bootstrap_demo

client = TestClient(app)


def _enrol():
    """A fresh enrolled employee; returns their pseudo_id."""
    bootstrap_demo("Acme Corp", "vanguard")
    admin = TestClient(app)
    admin.post("/v1/admin/login", json={"org_name": "Acme Corp", "password": "vanguard"})
    token = admin.post("/v1/admin/tokens", json={"department": "Engineering"}).json()["token"]
    return client.post("/v1/enroll", json={"token": token}).json()["pseudo_id"]


def test_submit_appeal_without_opt_in_stores_no_prompt_text():
    pid = _enrol()
    r = client.post("/v1/appeals", json={
        "pseudo_id": pid, "decision_type": "ethics",
        "category": "covert_surveillance", "reason": "I was asking about defending our own systems",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "pending"
    # 🔴 The load-bearing privacy assertion: default appeal has no disclosed text.
    mine = client.get("/v1/appeals", params={"pseudo_id": pid}).json()
    assert len(mine) == 1
    assert "disclosed_text" not in mine[0]  # the list view never returns it
    # and it is NULL in storage
    from app.deps import get_conn
    row = get_conn().execute(
        "SELECT disclosed_text FROM decision_appeals WHERE id = ?", (body["id"],)
    ).fetchone()
    assert row["disclosed_text"] is None


def test_submit_appeal_with_opt_in_stores_disclosed_text():
    pid = _enrol()
    r = client.post("/v1/appeals", json={
        "pseudo_id": pid, "decision_type": "pii", "category": "NRIC",
        "reason": "that is a product code, not an IC", "disclosed_text": "SKU 880101-14-5566",
    })
    assert r.status_code == 201
    from app.deps import get_conn
    row = get_conn().execute(
        "SELECT disclosed_text FROM decision_appeals WHERE id = ?", (r.json()["id"],)
    ).fetchone()
    assert row["disclosed_text"] == "SKU 880101-14-5566"


def test_unknown_pseudo_id_is_401():
    r = client.post("/v1/appeals", json={
        "pseudo_id": "nope", "decision_type": "ethics", "category": "x", "reason": "y",
    })
    assert r.status_code == 401


def test_smuggled_prompt_field_is_422_and_not_echoed():
    pid = _enrol()
    r = client.post("/v1/appeals", json={
        "pseudo_id": pid, "decision_type": "ethics", "category": "x",
        "reason": "y", "prompt": "the secret prompt text",
    })
    assert r.status_code == 422
    assert "the secret prompt text" not in r.text


def test_list_returns_only_the_callers_appeals():
    a = _enrol()
    b = _enrol()
    client.post("/v1/appeals", json={"pseudo_id": a, "decision_type": "ethics", "category": "x", "reason": "ra"})
    client.post("/v1/appeals", json={"pseudo_id": b, "decision_type": "ethics", "category": "x", "reason": "rb"})
    assert len(client.get("/v1/appeals", params={"pseudo_id": a}).json()) == 1
