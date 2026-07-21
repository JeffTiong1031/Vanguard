## Task 3: Admin review routes (queue + decide)

**Files:**
- Modify: `code/policy/app/routes/admin.py` (add two routes)
- Test: `code/policy/tests/test_appeals.py` (append)

**Interfaces:**
- Consumes: `AppealDecision` (Task 1); `_require_admin` (existing); the `decision_appeals` table (Task 1).
- Produces:
  - `GET /v1/admin/appeals` → queue for the org, department joined, includes `disclosed_text`.
  - `POST /v1/admin/appeals/{appeal_id}` body `{decision, note?}` → `{status}`; 404 unknown; 409 already decided.

- [ ] **Step 1: Write the failing tests**

Append to `code/policy/tests/test_appeals.py`:

```python
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd code/policy && .venv/Scripts/python -m pytest tests/test_appeals.py -q`
Expected: FAIL — the two new tests 404/401 on the admin appeals routes.

- [ ] **Step 3: Add the routes**

In `code/policy/app/routes/admin.py`, add `AppealDecision` to the model import (`from app.models import AdminLogin, AppealDecision`), and add these two routes after `decide_request` (before `usage`):

```python
@router.get("/appeals")
async def list_appeals(vg_admin: str | None = Cookie(default=None)) -> list[dict]:
    org_id = _require_admin(vg_admin)
    return [dict(r) for r in get_conn().execute(
        "SELECT a.id, a.decision_type, a.category, a.employee_reason, a.disclosed_text,"
        "       a.status, a.admin_note, a.created_at, e.department"
        " FROM decision_appeals a"
        " JOIN employees e ON e.id = a.employee_id"
        " WHERE a.org_id = ? ORDER BY a.created_at DESC",
        (org_id,),
    )]


@router.post("/appeals/{appeal_id}")
async def decide_appeal(
    appeal_id: str,
    body: AppealDecision,
    vg_admin: str | None = Cookie(default=None),
) -> dict[str, str]:
    org_id = _require_admin(vg_admin)
    conn = get_conn()
    row = conn.execute(
        "SELECT 1 FROM decision_appeals WHERE id = ? AND org_id = ? AND status = 'pending'",
        (appeal_id, org_id),
    ).fetchone()
    if row is None:
        # Same 404-vs-409 split as decide_request: a decided appeal must not be
        # silently re-decided just because the console offered the buttons again.
        exists = conn.execute(
            "SELECT 1 FROM decision_appeals WHERE id = ? AND org_id = ?",
            (appeal_id, org_id),
        ).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="unknown appeal")
        raise HTTPException(status_code=409, detail="appeal already decided")

    conn.execute(
        "UPDATE decision_appeals SET status = ?, admin_note = ?, decided_at = ?"
        " WHERE id = ? AND org_id = ? AND status = 'pending'",
        (body.decision, body.note, now_iso(), appeal_id, org_id),
    )
    conn.commit()
    return {"status": body.decision}
```

`AppealDecision` uses `extra="forbid"` and a `Literal`, so an invalid `decision` is a 422 before the handler runs — no manual check needed (unlike `decide_request`, which takes a bare `Body`).

- [ ] **Step 4: Run the tests**

Run: `cd code/policy && .venv/Scripts/python -m pytest tests/test_appeals.py -q`
Expected: PASS, all appeal tests (8 total).

- [ ] **Step 5: Run the whole policy suite (no regressions)**

Run: `cd code/policy && .venv/Scripts/python -m pytest -q`
Expected: PASS (existing 74 + the new appeal tests).

- [ ] **Step 6: Commit**

```bash
git add code/policy/app/routes/admin.py code/policy/tests/test_appeals.py
git commit -m "feat(policy): admin appeal review queue and decide (409 on re-decide)"
```

---

