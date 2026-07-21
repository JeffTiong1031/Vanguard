# Explainable Enforcement & Appeals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Vanguard enforcement decision (ethics block, PII redaction, tool-access block) explain itself in plain language, and make the content decisions (ethics/PII) contestable end-to-end — employee requests a review, an admin decides in the console, the employee sees the outcome.

**Architecture:** A static explanation catalog in the extension renders in the existing block modals/banner (instant, offline). A new `decision_appeals` object in the policy service stores contests submitted through the background service worker; a new console "Reviews" screen resolves them; the extension's options page polls outcomes. No new services.

**Tech Stack:** Python 3.11+ · FastAPI · SQLite (policy service) · WXT · TypeScript · Preact · vitest (extension) · Preact + Vite (admin console).

**Spec:** [`docs/superpowers/specs/2026-07-21-explainable-enforcement-and-appeals-design.md`](../specs/2026-07-21-explainable-enforcement-and-appeals-design.md)

## Global Constraints

- 🔴 **I3 — a default appeal carries NO prompt text.** Only `class + reason`. Raw text reaches the server ONLY via the opt-in `disclosed_text`, consent-gated in the UI.
- 🔴 **All wire models set `extra="forbid"`** — a smuggled field is a 422, never a silent drop.
- 🔴 **Appeal ≠ real-time unblock.** Review is asynchronous; the block held in the moment.
- **On-device inference only** — the explanation catalog is local to the extension; no network at block time (the gate is synchronous).
- **Employee stays pseudonymous** — `pseudo_id` is the only handle, as for events and access requests.
- **Commit messages: no `Co-Authored-By` trailer.**
- **Run tests from the component root:** policy `code/policy` → `.venv/Scripts/python -m pytest -q`; extension `code/extension` → `npx vitest run <path>`.
- **`dist/` is committed and drift-checked** — after any extension source change, `npm run build` and `npm run check:dist` must pass (handled in Task 11).
- Branch: `transparency-redressal`.

---

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

## Task 4: The explanation catalog (extension)

**Files:**
- Create: `code/extension/src/detection/explanations.ts`
- Test: `code/extension/tests/explanations.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `explain(kind: ExplainKind, key: string): Explanation` where
  `ExplainKind = 'ethics' | 'pii' | 'tool'` and
  `Explanation = { title: string; why: string; note: string }`.

- [ ] **Step 1: Write the failing test**

Create `code/extension/tests/explanations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { explain } from '../src/detection/explanations';

describe('explain', () => {
  it('gives a specific reason for a known ethics category', () => {
    const e = explain('ethics', 'covert_surveillance');
    expect(e.why.toLowerCase()).toContain('monitor');
    expect(e.note).toContain('on your device');       // the "AI was involved" line
  });

  it('gives a specific reason for a known PII class', () => {
    expect(explain('pii', 'NRIC').why).toMatch(/IC|identity/i);
  });

  it('has a tool entry', () => {
    expect(explain('tool', 'any').why.toLowerCase()).toContain('reviewed');
  });

  it('falls back to a generic explanation for an unknown key, never blank', () => {
    const e = explain('ethics', 'something_new');
    expect(e.title.length).toBeGreaterThan(0);
    expect(e.why.length).toBeGreaterThan(0);
    expect(e.note.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd code/extension && npx vitest run tests/explanations.test.ts`
Expected: FAIL — cannot resolve `../src/detection/explanations`.

- [ ] **Step 3: Implement the catalog**

Create `code/extension/src/detection/explanations.ts`:

```typescript
/**
 * Plain-language explanations for every enforcement decision the employee sees.
 *
 * This is the transparency half of case-study 3b: name WHY a decision was made,
 * and make clear a machine decided it on-device (AI was involved, no human read
 * the prompt). Wording ships here in the extension (Approach A) -- changing it
 * means a rebuild, which is fine.
 */
export type ExplainKind = 'ethics' | 'pii' | 'tool';
export type Explanation = { title: string; why: string; note: string };

/** Shared across every entry -- the "AI was involved + on-device" disclosure. */
const NOTE = 'Decided automatically on your device by Vanguard’s classifier — no person read your prompt.';

const ETHICS: Record<string, Explanation> = {
  covert_surveillance: { title: 'Covert monitoring', why: 'This asks how to monitor or track people without their knowledge, which your organisation does not permit AI to be used for.', note: NOTE },
  discriminatory_screening: { title: 'Discriminatory screening', why: 'This asks to screen, rank, or filter people using traits that would be unfair or unlawful to decide on.', note: NOTE },
  harassment_content: { title: 'Harassing content', why: 'This asks to produce content that would harass, threaten, or demean a person.', note: NOTE },
  regulatory_circumvention: { title: 'Evading obligations', why: 'This asks for help avoiding a legal, safety, or regulatory obligation.', note: NOTE },
  security_evasion: { title: 'Security evasion', why: 'This asks how to defeat a security control or produce code intended to exploit one.', note: NOTE },
  undisclosed_profiling: { title: 'Undisclosed profiling', why: 'This asks to profile or infer sensitive facts about a person without their knowledge.', note: NOTE },
};

const PII: Record<string, Explanation> = {
  NRIC: { title: 'Malaysian IC number', why: 'This looks like a Malaysian identity-card number, so it was masked before it could reach the AI provider.', note: NOTE },
  SSM: { title: 'Company registration number', why: 'This looks like an SSM company-registration number and was masked.', note: NOTE },
  TIN: { title: 'Tax number', why: 'This looks like a tax identification number and was masked.', note: NOTE },
  EMAIL: { title: 'Email address', why: 'This is an email address and was masked before reaching the AI provider.', note: NOTE },
  CARD: { title: 'Payment-card number', why: 'This looks like a payment-card number and was masked.', note: NOTE },
  PERSON: { title: 'Personal name', why: 'This looks like a person’s name and was masked to keep it from the AI provider.', note: NOTE },
  ORG: { title: 'Organisation name', why: 'This looks like a company or organisation name and was masked.', note: NOTE },
};

const TOOL: Explanation = {
  title: 'Tool not approved',
  why: 'This AI tool has not been reviewed by your organisation for how it handles company data, so it is not on the approved list yet.',
  note: 'This is a policy decision. You can ask your admin to review and approve it.',
};

const GENERIC: Explanation = {
  title: 'Automated decision',
  why: 'Vanguard’s classifier flagged this against your organisation’s policy.',
  note: NOTE,
};

export function explain(kind: ExplainKind, key: string): Explanation {
  if (kind === 'tool') return TOOL;
  const table = kind === 'ethics' ? ETHICS : PII;
  return table[key] ?? GENERIC;
}
```

- [ ] **Step 4: Run the test**

Run: `cd code/extension && npx vitest run tests/explanations.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add code/extension/src/detection/explanations.ts code/extension/tests/explanations.test.ts
git commit -m "feat(ext): plain-language explanation catalog for enforcement decisions"
```

---

## Task 5: The appeal client, message contract, and background handlers

**Files:**
- Create: `code/extension/src/policy/appeals.ts`
- Modify: `code/extension/src/policy/messages.ts`
- Modify: `code/extension/entrypoints/background.ts`
- Test: `code/extension/tests/appeals-client.test.ts`

**Interfaces:**
- Consumes: `getEnrolment` (`store.ts`), `getPolicyBase` (`config.ts`), `timedFetch` pattern (`client.ts`).
- Produces:
  - `submitAppeal(input: AppealInput): Promise<void>` where
    `AppealInput = { decisionType: 'ethics'|'pii'; category: string; reason: string; disclosedText?: string }`
  - `fetchMyAppeals(): Promise<AppealRow[]>` where
    `AppealRow = { id: string; decision_type: string; category: string; status: 'pending'|'upheld'|'overturned'; admin_note: string | null; created_at: string; decided_at: string | null }`
  - message kinds `appeal-submit` and `appeals-get` on `PolicyRequest`, and `AppealsResponse`.

- [ ] **Step 1: Write the failing test**

Create `code/extension/tests/appeals-client.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { submitAppeal } from '../src/policy/appeals';

function stubEnrolled() {
  const bag: Record<string, unknown> = {
    vg_enrolment: { org_id: 'o1', org_name: 'A', pseudo_id: 'p1', department: 'Eng' },
    vg_policy_base: 'http://localhost:8001',
  };
  vi.stubGlobal('chrome', {
    storage: { local: { get: async (k: string) => (k in bag ? { [k]: bag[k] } : {}) } },
  });
}

beforeEach(() => { stubEnrolled(); });

describe('submitAppeal', () => {
  it('sends class + reason and OMITS disclosed_text when not opted in', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"a1","status":"pending"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await submitAppeal({ decisionType: 'ethics', category: 'covert_surveillance', reason: 'defence' });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({
      pseudo_id: 'p1', decision_type: 'ethics', category: 'covert_surveillance', reason: 'defence',
    });
    // 🔴 the load-bearing privacy assertion
    expect('disclosed_text' in body).toBe(false);
  });

  it('includes disclosed_text only when provided', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"a1","status":"pending"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await submitAppeal({ decisionType: 'pii', category: 'NRIC', reason: 'product code', disclosedText: 'SKU 880101-14-5566' });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.disclosed_text).toBe('SKU 880101-14-5566');
  });

  it('throws when not enrolled', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}) } } });
    vi.stubGlobal('fetch', vi.fn());
    await expect(submitAppeal({ decisionType: 'ethics', category: 'x', reason: 'y' })).rejects.toThrow(/enrol/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd code/extension && npx vitest run tests/appeals-client.test.ts`
Expected: FAIL — cannot resolve `../src/policy/appeals`.

- [ ] **Step 3: Implement the appeal client**

Create `code/extension/src/policy/appeals.ts`:

```typescript
/**
 * Appeal client. BACKGROUND SERVICE WORKER ONLY (same reason as client.ts: a
 * content script cannot fetch http:// on a LAN address).
 *
 * 🔴 I3: the payload is class + reason. `disclosed_text` is attached ONLY when
 * the caller passes it -- which the modal does only when the employee ticks the
 * opt-in box. The key is omitted entirely otherwise, so it can never default to
 * carrying the prompt.
 */
import { getPolicyBase } from './config';
import { getEnrolment } from './store';

export type AppealInput = {
  decisionType: 'ethics' | 'pii';
  category: string;
  reason: string;
  disclosedText?: string;
};

export type AppealRow = {
  id: string;
  decision_type: string;
  category: string;
  status: 'pending' | 'upheld' | 'overturned';
  admin_note: string | null;
  created_at: string;
  decided_at: string | null;
};

export async function submitAppeal(input: AppealInput): Promise<void> {
  const enrolment = await getEnrolment();
  if (!enrolment) throw new Error('Not enrolled.');
  const base = await getPolicyBase();
  const body: Record<string, unknown> = {
    pseudo_id: enrolment.pseudo_id,
    decision_type: input.decisionType,
    category: input.category,
    reason: input.reason,
  };
  if (input.disclosedText) body.disclosed_text = input.disclosedText;
  const res = await fetch(`${base}/v1/appeals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Appeal failed (${res.status}).`);
}

export async function fetchMyAppeals(): Promise<AppealRow[]> {
  const enrolment = await getEnrolment();
  if (!enrolment) return [];
  const base = await getPolicyBase();
  const res = await fetch(`${base}/v1/appeals?pseudo_id=${encodeURIComponent(enrolment.pseudo_id)}`);
  if (!res.ok) return [];
  return (await res.json()) as AppealRow[];
}
```

- [ ] **Step 4: Run the appeal-client test**

Run: `cd code/extension && npx vitest run tests/appeals-client.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Extend the message contract**

In `code/extension/src/policy/messages.ts`, add to the `PolicyRequest` union:

```typescript
  | { kind: 'appeal-submit'; decisionType: 'ethics' | 'pii'; category: string; reason: string; disclosedText?: string }
  | { kind: 'appeals-get' }
```

and add a response type after `PolicyResponse`:

```typescript
import type { AppealRow } from './appeals';

export type AppealsResponse =
  | { kind: 'appeals-result'; ok: true; appeals: AppealRow[] }
  | { kind: 'appeals-result'; ok: false; error: string };
```

(`isPolicyRequest` already matches any `kind` starting with a known prefix — extend it to also accept `appeal`:)

```typescript
export function isPolicyRequest(msg: unknown): msg is PolicyRequest {
  const kind = (msg as PolicyRequest)?.kind;
  return typeof kind === 'string' && (kind.startsWith('policy-') || kind.startsWith('appeal'));
}
```

- [ ] **Step 6: Handle the two kinds in the background worker**

In `code/extension/entrypoints/background.ts`, add to the imports:

```typescript
import { submitAppeal, fetchMyAppeals } from '../src/policy/appeals';
import type { AppealsResponse } from '../src/policy/messages';
```

and add two `case`s inside the existing `switch (msg.kind)` of the policy listener, after `policy-event`:

```typescript
          case 'appeal-submit': {
            await submitAppeal({
              decisionType: msg.decisionType, category: msg.category,
              reason: msg.reason, disclosedText: msg.disclosedText,
            });
            sendResponse({ kind: 'policy-result', ok: true, policy: null, enrolment: null } satisfies PolicyResponse);
            return;
          }
          case 'appeals-get': {
            sendResponse({ kind: 'appeals-result', ok: true, appeals: await fetchMyAppeals() } satisfies AppealsResponse);
            return;
          }
```

- [ ] **Step 7: Build to confirm types compile**

Run: `cd code/extension && npx vitest run tests/appeals-client.test.ts && npm run build`
Expected: tests PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add code/extension/src/policy/appeals.ts code/extension/src/policy/messages.ts code/extension/entrypoints/background.ts code/extension/tests/appeals-client.test.ts
git commit -m "feat(ext): appeal client + message contract + background handlers"
```

---

## Task 6: Ethics modal — explanation + Request-a-review

**Files:**
- Modify: `code/extension/src/ui/ethics-modal.ts`
- Modify: `code/extension/entrypoints/content.ts` (pass `category`, wire the review submit)
- Test: `code/extension/tests/ethics-modal.test.ts` (create)

**Interfaces:**
- Consumes: `explain` (Task 4); `AppealInput` shape (Task 5).
- Produces: `showEthicsModal` gains `category: string` and `onRequestReview: (reason: string, disclosedText?: string) => void`.

- [ ] **Step 1: Write the failing test**

Create `code/extension/tests/ethics-modal.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showEthicsModal, hideEthicsModal } from '../src/ui/ethics-modal';

function root(): ShadowRoot {
  return document.querySelector('[data-vanguard-ui="ethics-modal"]')!.shadowRoot!;
}

beforeEach(() => { document.body.innerHTML = ''; hideEthicsModal(); });

describe('ethics modal', () => {
  it('shows the plain-language why and the on-device note', () => {
    showEthicsModal({ label: 'Covert monitoring', category: 'covert_surveillance', orgName: 'Acme', onEdit: () => {}, onRequestReview: () => {} });
    const t = root().textContent!;
    expect(t.toLowerCase()).toContain('monitor');
    expect(t).toContain('on your device');
  });

  it('submits a review with the typed reason and no disclosed text by default', () => {
    const onRequestReview = vi.fn();
    showEthicsModal({ label: 'x', category: 'covert_surveillance', orgName: 'Acme', onEdit: () => {}, onRequestReview });
    root().querySelector<HTMLButtonElement>('[data-act="open-review"]')!.click();
    const reason = root().querySelector<HTMLTextAreaElement>('[data-act="reason"]')!;
    reason.value = 'defence not attack';
    reason.dispatchEvent(new Event('input'));
    root().querySelector<HTMLButtonElement>('[data-act="send-review"]')!.click();
    expect(onRequestReview).toHaveBeenCalledWith('defence not attack', undefined);
  });

  it('includes the prompt only when the opt-in box is ticked', () => {
    const onRequestReview = vi.fn();
    showEthicsModal({ label: 'x', category: 'covert_surveillance', orgName: 'Acme', promptText: 'the prompt', onEdit: () => {}, onRequestReview });
    root().querySelector<HTMLButtonElement>('[data-act="open-review"]')!.click();
    const reason = root().querySelector<HTMLTextAreaElement>('[data-act="reason"]')!;
    reason.value = 'r'; reason.dispatchEvent(new Event('input'));
    root().querySelector<HTMLInputElement>('[data-act="opt-in"]')!.click();
    root().querySelector<HTMLButtonElement>('[data-act="send-review"]')!.click();
    expect(onRequestReview).toHaveBeenCalledWith('r', 'the prompt');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd code/extension && npx vitest run tests/ethics-modal.test.ts`
Expected: FAIL — `onRequestReview` / `category` not part of the options; no review UI.

- [ ] **Step 3: Extend the modal**

In `code/extension/src/ui/ethics-modal.ts`, import the catalog and widen the options:

```typescript
import { explain } from '../detection/explanations';

export type EthicsModalOptions = {
  label: string;
  category: string;
  orgName: string;
  promptText?: string;                       // present only so the employee CAN opt in to share it
  onEdit: () => void;
  onRequestReview: (reason: string, disclosedText?: string) => void;
};
```

Add to the `.body` markup (after the `.policy` div) a why paragraph, the note, and a review section; extend the stylesheet with the review controls. Replace the `.body`/`.foot` block of the `scrim.innerHTML` with:

```html
      <div class="body">
        <p>It appears to ask for something ${options.orgName} does not permit AI tools to be used for.</p>
        <div class="policy"></div>
        <p class="why"></p>
        <p class="note"></p>
        <div class="review" hidden>
          <label>If you believe this is wrong, tell a reviewer why:</label>
          <textarea data-act="reason" rows="3" placeholder="e.g. I was asking how to defend our own systems"></textarea>
          <label class="optin"><input type="checkbox" data-act="opt-in" />
            Include the exact text I was blocked on, so a person can review it.</label>
        </div>
      </div>
      <div class="foot">
        <button class="ghost" data-act="open-review">Request a review</button>
        <button data-act="send-review" hidden>Send review</button>
        <button data-act="edit">Edit my prompt</button>
      </div>
```

Add to the `<style>` text:

```css
    .why { margin: 12px 0 0; }
    .note { margin: 8px 0 0; color: #64748b; font-size: 13px; }
    .review { margin-top: 14px; }
    .review textarea { width: 100%; box-sizing: border-box; margin-top: 6px; padding: 8px;
                       border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; }
    .review .optin { display: flex; gap: 8px; align-items: flex-start; margin-top: 10px; font-size: 13px; color: #334155; }
    button.ghost { background: #fff; color: #b91c1c; border: 1px solid #fecaca; margin-right: auto; }
```

Then, after the existing `.policy` textContent line, wire the content and the review flow:

```typescript
  const ex = explain('ethics', options.category);
  scrim.querySelector('.why')!.textContent = ex.why;
  scrim.querySelector('.note')!.textContent = ex.note;

  const review = scrim.querySelector<HTMLDivElement>('.review')!;
  const sendBtn = scrim.querySelector<HTMLButtonElement>('[data-act="send-review"]')!;
  const openBtn = scrim.querySelector<HTMLButtonElement>('[data-act="open-review"]')!;
  let reason = '';
  scrim.querySelector('[data-act="reason"]')!.addEventListener('input', (e) => {
    reason = (e.target as HTMLTextAreaElement).value;
  });
  openBtn.addEventListener('click', () => { review.hidden = false; openBtn.hidden = true; sendBtn.hidden = false; });
  sendBtn.addEventListener('click', () => {
    const optIn = scrim.querySelector<HTMLInputElement>('[data-act="opt-in"]')!.checked;
    options.onRequestReview(reason, optIn ? options.promptText : undefined);
    hideEthicsModal();
  });
```

- [ ] **Step 4: Run the modal test**

Run: `cd code/extension && npx vitest run tests/ethics-modal.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it in `content.ts`**

In `code/extension/entrypoints/content.ts`, the `showEthicsModal({...})` call inside `onBlocked` becomes (the `ethics` verdict already has `.category`; `text` is the prompt in scope):

```typescript
          showEthicsModal({
            label: ethics.label,
            category: ethics.category,
            orgName: 'your organisation',
            promptText: text,
            onEdit: () => adapter.getComposer()?.focus(),
            onRequestReview: (reason, disclosedText) => {
              void chrome.runtime.sendMessage({
                kind: 'appeal-submit', decisionType: 'ethics',
                category: ethics.category, reason, disclosedText,
              }).catch(() => undefined);
            },
          });
```

- [ ] **Step 6: Full extension suite + build**

Run: `cd code/extension && npx vitest run && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add code/extension/src/ui/ethics-modal.ts code/extension/entrypoints/content.ts code/extension/tests/ethics-modal.test.ts
git commit -m "feat(ext): ethics modal explains the block and offers a review (opt-in disclosure)"
```

---

## Task 7: PII send-review — per-class explanation + report a wrong flag

**Files:**
- Modify: `code/extension/src/ui/modal.tsx`
- Test: `code/extension/tests/pii-explanation.test.tsx` (create)

**Interfaces:**
- Consumes: `explain` (Task 4); the existing `Finding` (`f.cls`, `f.text`) and per-span render in `Modal`.
- Produces: for each finding, a visible `why`, and a **Report a wrong flag** control that calls `chrome.runtime.sendMessage({ kind: 'appeal-submit', decisionType: 'pii', category: f.cls, reason, disclosedText? })`.

The `Modal` renders one row per `Finding` (keyed by `f.cls`, with the ignore-with-reason control). This task adds, inside that per-finding row, the catalog `why` line and a "Report a wrong flag" affordance.

- [ ] **Step 1: Write the failing test**

Create `code/extension/tests/pii-explanation.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { Modal } from '../src/ui/modal';
import type { Finding } from '../src/detection/l1/types';

const findings: Finding[] = [{ cls: 'NRIC', start: 3, end: 17, text: '880101-14-5566' }];

describe('PII send-review explanation + report', () => {
  it('shows the per-class why for a finding', () => {
    render(<Modal text="My 880101-14-5566 ok" findings={findings} files={[]} onProceed={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText(/Malaysian identity-card number/i)).toBeTruthy();
  });

  it('reports a wrong flag as a pii appeal', () => {
    const send = vi.fn(async () => ({}));
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
    render(<Modal text="My 880101-14-5566 ok" findings={findings} files={[]} onProceed={() => {}} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /report a wrong flag/i }));
    fireEvent.input(screen.getByPlaceholderText(/why/i), { target: { value: 'that is a product code' } });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'appeal-submit', decisionType: 'pii', category: 'NRIC', reason: 'that is a product code',
    }));
  });
});
```

> Note: the exact prop names for `Modal` (`text`, `findings`, `files`, `onProceed`, `onDismiss`) are the ones the component already declares in `ModalProps`. If the current `ModalProps` differs, match it — do not change the component's existing signature; only add the explanation + report UI inside the per-finding row.

- [ ] **Step 2: Run to verify failure**

Run: `cd code/extension && npx vitest run tests/pii-explanation.test.tsx`
Expected: FAIL — the why text and report button do not exist.

- [ ] **Step 3: Add explanation + report to the per-finding row**

In `code/extension/src/ui/modal.tsx`, import the catalog and the hooks already used:

```tsx
import { explain } from '../detection/explanations';
```

Inside the JSX that renders each `Finding` row (where `f.cls` is shown), add — after the existing class label — the why line and a report control. Use a local `useState` for the report form per finding:

```tsx
{/* transparency: why this was flagged */}
<p style="margin:4px 0 0;font-size:13px;color:#475569">{explain('pii', f.cls).why}</p>

{/* redressal: report a wrong flag */}
<ReportWrongFlag cls={f.cls} matched={f.text} />
```

and add this small component near the bottom of `modal.tsx`:

```tsx
function ReportWrongFlag({ cls, matched }: { cls: string; matched: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [sent, setSent] = useState(false);
  if (sent) return <p style="font-size:12px;color:#15803d;margin:4px 0 0">Report sent for review.</p>;
  if (!open) {
    return <button style="font-size:12px;background:none;border:none;color:#e11d48;cursor:pointer;padding:2px 0"
      onClick={() => setOpen(true)}>Report a wrong flag</button>;
  }
  return (
    <div style="margin:6px 0 0">
      <input placeholder="Why is this not sensitive?" value={reason}
        onInput={(e) => setReason((e.target as HTMLInputElement).value)}
        style="width:100%;box-sizing:border-box;padding:6px;border:1px solid #cbd5e1;border-radius:6px" />
      <label style="display:flex;gap:6px;align-items:flex-start;margin-top:6px;font-size:12px;color:#334155">
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn((e.target as HTMLInputElement).checked)} />
        Include the flagged text so a person can review it.
      </label>
      <button style="margin-top:6px;font-size:12px;border:none;border-radius:6px;background:#e11d48;color:#fff;padding:6px 10px;cursor:pointer"
        onClick={() => {
          void chrome.runtime.sendMessage({
            kind: 'appeal-submit', decisionType: 'pii', category: cls, reason,
            disclosedText: optIn ? matched : undefined,
          }).catch(() => undefined);
          setSent(true);
        }}>Send report</button>
    </div>
  );
}
```

Ensure `useState` is imported from `preact/hooks` in this file (it already is if the modal holds span decisions).

- [ ] **Step 4: Run the test**

Run: `cd code/extension && npx vitest run tests/pii-explanation.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add code/extension/src/ui/modal.tsx code/extension/tests/pii-explanation.test.tsx
git commit -m "feat(ext): PII send-review explains each flag and can report a wrong one"
```

---

## Task 8: Warn banner — why the tool is unapproved

**Files:**
- Modify: `code/extension/src/ui/warn-banner.ts`
- Test: `code/extension/tests/warn-banner.test.ts` (append if present, else create)

**Interfaces:**
- Consumes: `explain('tool', …)` (Task 4). No signature change — the banner already has `toolName`, `orgName`.

- [ ] **Step 1: Write the failing test**

Append to `code/extension/tests/warn-banner.test.ts` (create the file with the jsdom header if it does not exist):

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { showWarnBanner, hideWarnBanner } from '../src/ui/warn-banner';

function host(): ShadowRoot { return document.querySelector('[data-vanguard-ui="warn-banner"]')!.shadowRoot!; }
beforeEach(() => { document.body.innerHTML = ''; hideWarnBanner(); });

describe('warn banner explanation', () => {
  it('says why the tool is unapproved', () => {
    showWarnBanner({ toolName: 'DeepSeek', orgName: 'Acme', onRequest: async () => {}, onDismiss: () => {} });
    expect(host().textContent!.toLowerCase()).toContain('reviewed');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd code/extension && npx vitest run tests/warn-banner.test.ts`
Expected: FAIL — the "reviewed" wording is not present.

- [ ] **Step 3: Add the why line**

In `code/extension/src/ui/warn-banner.ts`, import the catalog:

```typescript
import { explain } from '../detection/explanations';
```

In the `render('warn')` branch, after the existing `${options.toolName} is not approved…` text line, append the why sentence:

```typescript
    bar.append(text(explain('tool', '').why));
```

- [ ] **Step 4: Run the test**

Run: `cd code/extension && npx vitest run tests/warn-banner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add code/extension/src/ui/warn-banner.ts code/extension/tests/warn-banner.test.ts
git commit -m "feat(ext): warn banner explains why a tool is unapproved"
```

---

## Task 9: Options page — "My reviews"

**Files:**
- Modify: `code/extension/entrypoints/options/main.tsx`
- Test: none new (UI wiring; covered by the appeals-client test + manual acceptance in Task 11).

**Interfaces:**
- Consumes: the `appeals-get` message (Task 5), `AppealsResponse`.

- [ ] **Step 1: Add a MyReviews component and render it**

In `code/extension/entrypoints/options/main.tsx`, add near the other components:

```tsx
import type { AppealsResponse } from '../../src/policy/messages';
import type { AppealRow } from '../../src/policy/appeals';

function MyReviews() {
  const [rows, setRows] = useState<AppealRow[]>([]);
  useEffect(() => {
    const load = () => chrome.runtime.sendMessage({ kind: 'appeals-get' })
      .then((r: AppealsResponse) => { if (r?.ok) setRows(r.appeals); }).catch(() => {});
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  if (rows.length === 0) return null;
  return (
    <section style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:20px">
      <h1 style="font-size:18px">My reviews</h1>
      <p style="color:#475569">Decisions you asked a person to review.</p>
      {rows.map((r) => (
        <div key={r.id} style="display:flex;gap:10px;align-items:center;margin:8px 0;font-size:14px">
          <span style="width:190px">{r.decision_type} · {r.category}</span>
          <strong style={r.status === 'overturned' ? 'color:#15803d' : r.status === 'upheld' ? 'color:#b91c1c' : 'color:#64748b'}>
            {r.status}
          </strong>
          {r.admin_note && <span style="color:#475569">— {r.admin_note}</span>}
        </div>
      ))}
    </section>
  );
}
```

and add `<MyReviews />` to the `Options()` render tree, below `<FileService />`.

- [ ] **Step 2: Build**

Run: `cd code/extension && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add code/extension/entrypoints/options/main.tsx
git commit -m "feat(ext): options page shows the outcome of the employee's review requests"
```

---

## Task 10: Admin console — the Reviews screen

**Files:**
- Create: `code/policy/admin/src/screens/Reviews.tsx`
- Modify: `code/policy/admin/src/main.tsx` (nav + route), `code/policy/admin/src/api.ts` (types), `code/policy/admin/src/icons.tsx` (icon)
- Test: none new (console has no unit tests; covered by manual acceptance in Task 11).

**Interfaces:**
- Consumes: `GET /v1/admin/appeals`, `POST /v1/admin/appeals/{id}` (Task 3); the `api` wrapper and `Screen`/nav pattern already in the console.

- [ ] **Step 1: Add the row type to `api.ts`**

In `code/policy/admin/src/api.ts`, next to the other exported `type`s:

```typescript
export type AppealRow = {
  id: string; decision_type: string; category: string; employee_reason: string;
  disclosed_text: string | null; status: 'pending' | 'upheld' | 'overturned';
  admin_note: string | null; created_at: string; department: string;
};
```

- [ ] **Step 2: Add a Reviews icon to `icons.tsx`**

Append to `code/policy/admin/src/icons.tsx` (same `base` + `P` pattern the file already uses):

```tsx
export const GavelIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m14 13-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10" />
    <path d="m16 16 6-6" /><path d="m8 8 6-6" />
    <path d="m9 7 8 8" /><path d="m21 11-8-8" />
  </svg>
);
```

- [ ] **Step 3: Create the Reviews screen**

Create `code/policy/admin/src/screens/Reviews.tsx` (mirrors `Requests.tsx`: load, 3s poll, stale-response guard, decide):

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, UnauthorisedError, type AppealRow } from '../api';
import { GavelIcon } from '../icons';

export function Reviews() {
  const [rows, setRows] = useState<AppealRow[]>([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const seq = useRef(0);

  async function load() {
    const mine = ++seq.current;
    try {
      const data = await api.get<AppealRow[]>('/v1/admin/appeals');
      if (mine !== seq.current) return;
      setRows(data); setError('');
    } catch (err) {
      if (err instanceof UnauthorisedError) throw err;
      setError(err instanceof Error ? err.message : 'Could not load reviews.');
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(t);
  }, []);

  async function decide(id: string, decision: 'upheld' | 'overturned') {
    setBusyId(id); setError('');
    try {
      await api.post(`/v1/admin/appeals/${id}`, { decision });
      await load();
    } catch (err) {
      if (err instanceof UnauthorisedError) throw err;
      setError(err instanceof Error ? err.message : 'Could not update the review.');
    } finally { setBusyId(''); }
  }

  const pending = rows.filter((r) => r.status === 'pending');

  return (
    <section class="panel">
      <div class="panel-head">
        <span class="ico"><GavelIcon /></span>
        <div>
          <h2>Reviews</h2>
          <p class="sub">Employees contesting an automated block or redaction. Uphold the decision or overturn it.</p>
        </div>
        <span class="tag count">{pending.length} pending</span>
      </div>
      {error && <p class="error">{error}</p>}
      {rows.length === 0 && <p class="empty">No review requests yet.</p>}
      {rows.length > 0 && (
        <table>
          <thead><tr><th>Type</th><th>Category</th><th>Dept</th><th>Employee's reason</th><th>Shared text</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><span class="name">{r.decision_type}</span></td>
                <td><code>{r.category}</code></td>
                <td>{r.department}</td>
                <td>{r.employee_reason}</td>
                <td>{r.disclosed_text
                  ? <code title="the employee chose to share this">{r.disclosed_text}</code>
                  : <span style="color:#94a3b8">not shared</span>}</td>
                <td>
                  {r.status === 'pending' ? (
                    <div class="row-actions">
                      <button class="btn-danger btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'upheld')}>Uphold</button>
                      <button class="btn-primary btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'overturned')}>Overturn</button>
                    </div>
                  ) : <span class={`pill ${r.status === 'overturned' ? 'approved' : 'blocked'}`}>{r.status}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Add it to the nav in `main.tsx`**

In `code/policy/admin/src/main.tsx`: import it and the icon, extend the `Screen` type and `TABS`, and render it.

```tsx
import { Reviews } from './screens/Reviews';
import { GavelIcon } from './icons';   // add GavelIcon to the existing icons import
```

- change `type Screen = 'tools' | 'requests' | 'usage' | 'tokens';` to include `| 'reviews'`.
- add `['reviews', 'Reviews', GavelIcon],` to the `TABS` array.
- add `{screen === 'reviews' && <Reviews />}` in the `<main>` block.

- [ ] **Step 5: Build the console**

Run: `cd code/policy/admin && npm run build`
Expected: build succeeds; output written to `../app/static/`.

- [ ] **Step 6: Commit**

```bash
git add code/policy/admin/src/screens/Reviews.tsx code/policy/admin/src/main.tsx code/policy/admin/src/api.ts code/policy/admin/src/icons.tsx code/policy/app/static/
git commit -m "feat(console): Reviews screen to resolve employee appeals"
```

---

## Task 11: Build, drift, full suites, ADR, and acceptance

**Files:**
- Create: `docs/adr/0032-explainable-enforcement-and-appeals.md`
- Modify: `code/extension/dist/` (rebuilt)

- [ ] **Step 1: Rebuild the extension and check drift**

```bash
cd code/extension
npm run build
npm run check:dist
```
Expected: `dist/ matches a fresh build.`

- [ ] **Step 2: Run both full suites**

```bash
cd code/extension && npx vitest run
cd code/policy && .venv/Scripts/python -m pytest -q
```
Expected: all PASS. Record the counts.

- [ ] **Step 3: Write ADR 0032**

Create `docs/adr/0032-explainable-enforcement-and-appeals.md`:

```markdown
# ADR 0032 — Enforcement decisions explain themselves and can be appealed

**Status:** Accepted · **Date:** 2026-07-21

## Context
Case-study challenge 3b (transparency & redressal for affected people) scored 2/10:
Vanguard governs inputs to AI but had no concept of the decisions it makes about a
person. The affected person, though, is the employee whose prompt Vanguard itself
blocked or redacted — already present in the extension at the moment of the decision.

## Decision
Every enforcement decision (ethics block, PII redaction, tool-access block) renders a
plain-language explanation naming the category and stating a machine decided it
on-device. Content decisions (ethics, PII) can be contested: the employee submits an
appeal (class + reason, prompt text only via an explicit opt-in), an admin resolves it
in a new console Reviews screen, and the employee sees the outcome by polling.

## Consequences
- Redressal is review + record + feedback, NOT a real-time unblock; an ethics block
  holds in the moment (fail-closed). An overturned appeal is a labelled false positive.
- `disclosed_text` is the one path prompt text can reach the company server, opt-in and
  purpose-limited; a production build must add a retention limit and fold it into the DPA.
- The `pseudo_id` is a bearer handle for `GET /v1/appeals` (same trust model as events);
  production would bind it to the enrolment session.
```

- [ ] **Step 4: Manual acceptance (record results, do not infer)**

Run the stack (`docs/../README.md` governance quick start), then walk spec §7:
1. Ethics-violating prompt → modal shows the plain-language *why* + on-device note → Request a review, reason, opt-in OFF, submit.
2. Console → Reviews → appeal appears with category + department + reason and **no shared text** → Overturn + note.
3. Extension options → My reviews → shows **overturned** + note.
4. Repeat with opt-in ON → shared text shows in the queue, labelled.
5. A PII redaction shows a per-class why + Report a wrong flag.
6. An unapproved-tool banner shows *why*; its redressal is the existing Request access.

🔴 Read the actual UI outcome; do not report a pass from code inspection alone.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0032-explainable-enforcement-and-appeals.md code/extension/dist/
git commit -m "docs(adr): 0032 explainable enforcement & appeals; rebuild dist"
```

---

## Self-review notes

- **Spec coverage:** §3.2 transparency → Tasks 4,6,7,8; §3.3 redressal → Tasks 2,3,5,6,7; §3.4 data model/API → Tasks 1,2,3; §3.5 console → Task 10; §3.6 options + messages + content wiring → Tasks 5,6,9; §4 privacy invariants → the two load-bearing tests in Tasks 2 and 5; §6 testing → each task's tests; §7 acceptance → Task 11.
- **Type consistency:** `AppealInput`/`AppealRow` defined in Task 5 and reused in Tasks 6,7,9,10; the message kinds `appeal-submit`/`appeals-get` defined in Task 5 and consumed in Tasks 6,7,9; the server field names (`decision_type`, `disclosed_text`, `employee_reason`) are consistent across Tasks 1–3 and the client in Task 5.
- **Privacy guardrails are tests, not comments:** Task 2 asserts `disclosed_text IS NULL` on a default appeal; Task 5 asserts the client omits the key unless opted in.
