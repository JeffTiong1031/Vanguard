## Task 1: The `decision_appeals` table and wire models

**Files:**
- Modify: `code/policy/app/db.py` (add table + index to the `SCHEMA` string)
- Modify: `code/policy/app/models.py` (add `AppealCreate`, `AppealDecision`)
- Test: `code/policy/tests/test_models.py` (append), `code/policy/tests/test_db.py` (append)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Table `decision_appeals(id, org_id, employee_id, decision_type, category, employee_reason, disclosed_text, status, admin_note, created_at, decided_at)`
  - `AppealCreate(pseudo_id: str, decision_type: Literal['ethics','pii'], category: str, reason: str≤500, disclosed_text: Optional[str]≤4000=None)`
  - `AppealDecision(decision: Literal['upheld','overturned'], note: Optional[str]≤500=None)`

- [ ] **Step 1: Write the failing model tests**

Append to `code/policy/tests/test_models.py`:

```python
from app.models import AppealCreate, AppealDecision
import pytest
from pydantic import ValidationError


def test_appeal_create_defaults_disclosed_text_to_none():
    a = AppealCreate(pseudo_id="p1", decision_type="ethics", category="covert_surveillance", reason="I meant defence")
    assert a.disclosed_text is None


def test_appeal_create_rejects_unknown_field():
    with pytest.raises(ValidationError):
        AppealCreate(pseudo_id="p1", decision_type="pii", category="NRIC", reason="ok", prompt="leaked")


def test_appeal_create_rejects_bad_decision_type():
    with pytest.raises(ValidationError):
        AppealCreate(pseudo_id="p1", decision_type="tool", category="x", reason="ok")


def test_appeal_decision_only_allows_two_verdicts():
    assert AppealDecision(decision="overturned").note is None
    with pytest.raises(ValidationError):
        AppealDecision(decision="maybe")
```

- [ ] **Step 2: Run to verify failure**

Run: `cd code/policy && .venv/Scripts/python -m pytest tests/test_models.py -q`
Expected: FAIL — `ImportError: cannot import name 'AppealCreate'`.

- [ ] **Step 3: Add the models**

Append to `code/policy/app/models.py` (it already imports `Literal, Optional, BaseModel, ConfigDict, Field`):

```python
class AppealCreate(BaseModel):
    """An employee contesting an automated enforcement decision.

    I3: there is NO field for the prompt by default. `disclosed_text` is the one
    place raw text can enter, and only when the employee ticks the opt-in box in
    the modal. extra="forbid" means a client cannot smuggle the prompt under some
    other key.
    """
    model_config = ConfigDict(extra="forbid")
    pseudo_id: str
    decision_type: Literal["ethics", "pii"]
    category: str
    reason: str = Field(max_length=500)
    disclosed_text: Optional[str] = Field(default=None, max_length=4000)


class AppealDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["upheld", "overturned"]
    note: Optional[str] = Field(default=None, max_length=500)
```

- [ ] **Step 4: Write the failing schema test**

Append to `code/policy/tests/test_db.py`:

```python
def test_decision_appeals_table_exists_with_expected_columns():
    from app.db import connect, init_schema
    conn = connect(":memory:")
    init_schema(conn)
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(decision_appeals)")}
    assert cols == {
        "id", "org_id", "employee_id", "decision_type", "category",
        "employee_reason", "disclosed_text", "status", "admin_note",
        "created_at", "decided_at",
    }
```

- [ ] **Step 5: Add the table to the schema**

In `code/policy/app/db.py`, inside the `SCHEMA` triple-quoted string, immediately after the `access_requests` table block and before `usage_events`, add:

```sql
CREATE TABLE IF NOT EXISTS decision_appeals (
    id              TEXT PRIMARY KEY,
    org_id          TEXT NOT NULL REFERENCES orgs(id),
    employee_id     TEXT NOT NULL REFERENCES employees(id),
    decision_type   TEXT NOT NULL CHECK (decision_type IN ('ethics', 'pii')),
    category        TEXT NOT NULL,
    employee_reason TEXT NOT NULL,
    disclosed_text  TEXT,
    status          TEXT NOT NULL CHECK (status IN ('pending', 'upheld', 'overturned')),
    admin_note      TEXT,
    created_at      TEXT NOT NULL,
    decided_at      TEXT
);
```

And next to the existing `CREATE INDEX` lines at the end of `SCHEMA`, add:

```sql
CREATE INDEX IF NOT EXISTS ix_appeals_org_status ON decision_appeals (org_id, status);
```

- [ ] **Step 6: Run both test files**

Run: `cd code/policy && .venv/Scripts/python -m pytest tests/test_models.py tests/test_db.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add code/policy/app/db.py code/policy/app/models.py code/policy/tests/test_models.py code/policy/tests/test_db.py
git commit -m "feat(policy): decision_appeals table and appeal wire models"
```

---

