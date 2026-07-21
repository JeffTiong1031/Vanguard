## Task 2: Employee appeal routes (submit + list own)

**Files:**
- Create: `code/policy/app/routes/appeals.py`
- Modify: `code/policy/app/main.py` (register the router)
- Test: `code/policy/tests/test_appeals.py` (create)

**Interfaces:**
- Consumes: `AppealCreate` (Task 1); the `employees` table (`pseudo_id → id, org_id`), as in `events.py`.
- Produces:
  - `POST /v1/appeals` → `{id, status}` (201); unknown `pseudo_id` → 401.
  - `GET /v1/appeals?pseudo_id=<p>` → `list[dict]` of that employee's own appeals: `id, decision_type, category, status, admin_note, created_at, decided_at`.

- [ ] **Step 1: Write the failing tests**

Create `code/policy/tests/test_appeals.py`:

```python
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd code/policy && .venv/Scripts/python -m pytest tests/test_appeals.py -q`
Expected: FAIL — 404 on `/v1/appeals` (route not registered).

- [ ] **Step 3: Create the router**

Create `code/policy/app/routes/appeals.py`:

```python
"""Employee-facing appeals against automated enforcement decisions.

An appeal carries the finding CLASS and the employee's own reason. It carries
prompt text ONLY when the employee ticked the opt-in box in the modal, arriving
here as `disclosed_text`. `AppealCreate` sets extra="forbid", so the prompt
cannot be smuggled under any other key -- I3 holds by construction.
"""
import uuid

from fastapi import APIRouter, HTTPException

from app.deps import get_conn
from app.models import AppealCreate
from app.security import now_iso

router = APIRouter()


@router.post("/v1/appeals", status_code=201)
async def create_appeal(body: AppealCreate) -> dict[str, str]:
    conn = get_conn()
    emp = conn.execute(
        "SELECT id, org_id FROM employees WHERE pseudo_id = ?", (body.pseudo_id,)
    ).fetchone()
    if emp is None:
        raise HTTPException(status_code=401, detail="unknown enrolment")

    appeal_id = uuid.uuid4().hex
    conn.execute(
        "INSERT INTO decision_appeals"
        " (id, org_id, employee_id, decision_type, category, employee_reason,"
        "  disclosed_text, status, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
        (appeal_id, emp["org_id"], emp["id"], body.decision_type, body.category,
         body.reason, body.disclosed_text, now_iso()),
    )
    conn.commit()
    return {"id": appeal_id, "status": "pending"}


@router.get("/v1/appeals")
async def list_my_appeals(pseudo_id: str) -> list[dict]:
    """The caller's OWN appeals only. disclosed_text is deliberately not returned
    -- the employee wrote it; the list view is a status tracker, not a mirror."""
    conn = get_conn()
    emp = conn.execute(
        "SELECT id FROM employees WHERE pseudo_id = ?", (pseudo_id,)
    ).fetchone()
    if emp is None:
        raise HTTPException(status_code=401, detail="unknown enrolment")
    return [dict(r) for r in conn.execute(
        "SELECT id, decision_type, category, status, admin_note, created_at, decided_at"
        " FROM decision_appeals WHERE employee_id = ? ORDER BY created_at DESC",
        (emp["id"],),
    )]
```

- [ ] **Step 4: Register the router**

In `code/policy/app/main.py`, next to the other `from app.routes import … as _x` lines (~line 100), add:

```python
from app.routes import appeals as _appeals  # noqa: E402
```

and next to the `app.include_router(...)` calls (~line 108), add:

```python
app.include_router(_appeals.router)
```

- [ ] **Step 5: Run the tests**

Run: `cd code/policy && .venv/Scripts/python -m pytest tests/test_appeals.py -q`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add code/policy/app/routes/appeals.py code/policy/app/main.py code/policy/tests/test_appeals.py
git commit -m "feat(policy): employee appeal submit + list-own routes (I3: no prompt text by default)"
```

---

