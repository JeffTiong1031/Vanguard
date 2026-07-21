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


def _admin():
    a = TestClient(app)
    a.post("/v1/admin/login", json={"org_name": "Acme Corp", "password": "vanguard"})
    return a


def test_admin_appeals_queue_requires_a_session():
    assert TestClient(app).get("/v1/admin/appeals").status_code == 401


def test_admin_sees_the_appeal_with_department_and_decides_it():
    pid = _enrol()
    appeal_id = client.post("/v1/appeals", json={
        "pseudo_id": pid, "decision_type": "ethics", "category": "covert_surveillance",
        "reason": "defence not attack",
    }).json()["id"]
    admin = _admin()
    queue = admin.get("/v1/admin/appeals").json()
    mine = [a for a in queue if a["id"] == appeal_id]
    assert len(mine) == 1
    assert mine[0]["department"] == "Engineering"
    assert mine[0]["category"] == "covert_surveillance"

    r = admin.post(f"/v1/admin/appeals/{appeal_id}", json={"decision": "overturned", "note": "fair point"})
    assert r.status_code == 200
    assert r.json()["status"] == "overturned"
    # the employee now sees the outcome
    mine = client.get("/v1/appeals", params={"pseudo_id": pid}).json()
    assert mine[0]["status"] == "overturned"
    assert mine[0]["admin_note"] == "fair point"


def test_deciding_twice_is_409():
    pid = _enrol()
    appeal_id = client.post("/v1/appeals", json={
        "pseudo_id": pid, "decision_type": "pii", "category": "NRIC", "reason": "x",
    }).json()["id"]
    admin = _admin()
    assert admin.post(f"/v1/admin/appeals/{appeal_id}", json={"decision": "upheld"}).status_code == 200
    assert admin.post(f"/v1/admin/appeals/{appeal_id}", json={"decision": "overturned"}).status_code == 409
