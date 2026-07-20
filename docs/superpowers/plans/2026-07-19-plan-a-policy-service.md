# Plan A — Policy Service & Admin Console — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `code/policy/` — a FastAPI + SQLite governance service and its Preact admin console — so an admin can mint enrolment tokens, approve or block AI tools, decide access requests, and see usage by department.

**Architecture:** A standalone service, separate from `code/backend/`. It owns all org state: orgs, per-department enrolment tokens, pseudonymous employees, the LLM registry, per-org tool policy, access requests, and usage events. `policy_version` on the org row bumps on every policy write and doubles as the HTTP ETag, so the extension's poll is a bodyless `304` almost always. The admin SPA is built by Vite and served as static files by the same FastAPI process.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic v2, stdlib `sqlite3` (no ORM — matches `code/backend/`'s dependency-light style), stdlib `hashlib.scrypt` for the admin password, Preact + Vite + TypeScript for the console.

**Spec:** [`docs/superpowers/specs/2026-07-19-ai-governance-platform-design.md`](../specs/2026-07-19-ai-governance-platform-design.md)

**Plans B (extension integration) and C (ethics classifier) are separate documents.** Plan A has no dependency on either and is demoable on its own in a browser.

---

## Global Constraints

These apply to every task. They are copied from the spec and the repo's standing rules.

- **This is a demo-grade build, not production.** Every shortcut must have an honest answer — see spec §9.
- 🔴 **I3 — the event store holds classes, counts, and salted-hash references. NEVER raw prompt text.** This is enforced structurally in Task 7 (`extra="forbid"` plus a hex-64 validator), not by convention.
- 🔴 **Admin authority is server-side.** The client never adjudicates whether someone is an admin. A client-side admin check was explicitly rejected in brainstorming and must not return.
- **Employees are pseudonymous.** `pseudo_id` + `department` only. No names, no email addresses, anywhere in the schema.
- **Enrolment tokens are per-department**, never per-org and never per-employee.
- **Do not modify `code/backend/`.** Its zero-retention tests must keep passing untouched. Plan A adds a *sibling* service.
- **No `Co-Authored-By` trailer on commits** (CLAUDE.md §6.1).
- **Every number that is a guess is tagged `(estimate)` in code comments**, matching `code/extension/src/files/config.ts`.
- Python: `requires-python = ">=3.11"`, matching `code/backend/pyproject.toml`.

### Why a separate service — do not "fix" this later

[`code/backend/README.md`](../../../code/backend/README.md) says the backend is *"policy, dictionary, and hashed audit ingest. Nothing else."* What was actually **built** there is the file extract/redact pipeline. The repo therefore has two different services conflated under one name, and `code/policy/` is the one that README was describing.

Keeping them apart also protects [`test_zero_retention.py`](../../../code/backend/tests/test_zero_retention.py), which defends a commercial claim in executable form. Merging an org database into that service turns *"we store nothing"* into *"we store nothing of file content, except…"*.

---

## File Structure

**Create — service:**

| Path | Responsibility |
|---|---|
| `code/policy/pyproject.toml` | Deps, pytest config |
| `code/policy/README.md` | What it is, how to run it, the boundary with `code/backend/` |
| `code/policy/app/__init__.py` | Package marker |
| `code/policy/app/db.py` | Connection, schema DDL, `bump_policy_version()` |
| `code/policy/app/models.py` | All Pydantic request/response models |
| `code/policy/app/security.py` | Token hashing, password KDF, session issue/verify |
| `code/policy/app/seed.py` | LLM registry catalog + demo org bootstrap |
| `code/policy/app/main.py` | App, CORS, router mounting, SPA static mount |
| `code/policy/app/routes/enroll.py` | `POST /v1/enroll` |
| `code/policy/app/routes/policy.py` | `GET /v1/policy` with ETag |
| `code/policy/app/routes/requests.py` | `POST /v1/requests` (employee) |
| `code/policy/app/routes/events.py` | `POST /v1/events` |
| `code/policy/app/routes/admin.py` | Login, tools, tokens, request decisions, usage |

**Create — console:**

| Path | Responsibility |
|---|---|
| `code/policy/admin/package.json`, `vite.config.ts`, `index.html`, `tsconfig.json` | Build setup |
| `code/policy/admin/src/main.tsx` | Router + shell |
| `code/policy/admin/src/api.ts` | Typed fetch wrapper, session-cookie aware |
| `code/policy/admin/src/screens/Login.tsx` | Admin login |
| `code/policy/admin/src/screens/Tools.tsx` | Registry approve/block + token minting |
| `code/policy/admin/src/screens/Requests.tsx` | Pending requests, approve/deny |
| `code/policy/admin/src/screens/Usage.tsx` | Events by department / tool / category |

**Create — tests:** `code/policy/tests/test_db.py`, `test_security.py`, `test_enroll.py`, `test_policy_etag.py`, `test_requests.py`, `test_events.py`, `test_admin.py`

**Modify:** none. Plan A touches no existing file.

---

## Task 1: Scaffold, schema, and the version-bump primitive

**Files:**
- Create: `code/policy/pyproject.toml`
- Create: `code/policy/app/__init__.py`
- Create: `code/policy/app/db.py`
- Create: `code/policy/tests/conftest.py`
- Modify: `.gitignore` (repo root)
- Test: `code/policy/tests/test_db.py`

**Interfaces:**
- Consumes: nothing
- Produces: `connect(path: str) -> sqlite3.Connection` · `init_schema(conn) -> None` · `bump_policy_version(conn, org_id: str) -> int` (returns the new version)

- [ ] **Step 1: Create the project file**

`code/policy/pyproject.toml`:

```toml
[project]
name = "vanguard-policy"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.30",
  "pydantic>=2.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "httpx>=0.27"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

Create an empty `code/policy/app/__init__.py`.

- [ ] **Step 2: Write `tests/conftest.py` — do not skip this**

`app/main.py` opens the database **at import time**, defaulting to `policy.db`. Without this file every test run writes a real database into the repo and leaks state between runs — tests would pass or fail depending on what a previous run left behind. The env var must be set *before* `app.main` is first imported, which is what a root `conftest.py` guarantees.

`code/policy/tests/conftest.py`:

```python
"""Point every test at an in-memory database.

This MUST run before `app.main` is imported, because that module opens its
connection at import time. pytest loads conftest.py first, which is the whole
reason this lives here rather than in a fixture.
"""
import os

os.environ["VANGUARD_POLICY_DB"] = ":memory:"
```

Add to the repo-root `.gitignore`:

```
# code/policy/
policy.db
code/policy/app/static/
```

`app/static/` is a Vite build artifact. Committing it would reproduce the `dist/`-drift problem ADR 0017 already flagged for the extension.

- [ ] **Step 3: Write the failing test**

`code/policy/tests/test_db.py`:

```python
import sqlite3

from app.db import bump_policy_version, connect, init_schema


def _conn() -> sqlite3.Connection:
    conn = connect(":memory:")
    init_schema(conn)
    return conn


def test_schema_creates_every_table():
    conn = _conn()
    names = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    assert {
        "orgs", "enroll_tokens", "employees", "llm_registry",
        "org_llm_policy", "policy_category", "access_requests", "usage_events",
    } <= names


def test_rows_are_addressable_by_column_name():
    conn = _conn()
    conn.execute(
        "INSERT INTO orgs (id, name, admin_password_hash, policy_version)"
        " VALUES ('o1', 'Acme', 'x', 1)"
    )
    row = conn.execute("SELECT name FROM orgs WHERE id='o1'").fetchone()
    assert row["name"] == "Acme"


def test_bump_returns_the_new_version_and_persists_it():
    conn = _conn()
    conn.execute(
        "INSERT INTO orgs (id, name, admin_password_hash, policy_version)"
        " VALUES ('o1', 'Acme', 'x', 1)"
    )
    assert bump_policy_version(conn, "o1") == 2
    assert bump_policy_version(conn, "o1") == 3
    stored = conn.execute("SELECT policy_version FROM orgs WHERE id='o1'").fetchone()
    assert stored["policy_version"] == 3


def test_employees_table_has_no_column_that_could_hold_a_name():
    """Pseudonymity is a schema property, not a convention (spec section 8)."""
    conn = _conn()
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(employees)")}
    assert cols == {"id", "org_id", "pseudo_id", "department", "created_at"}
```

- [ ] **Step 4: Run it and watch it fail**

```bash
cd code/policy && python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"
.venv/Scripts/python -m pytest tests/test_db.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.db'`

- [ ] **Step 5: Write `app/db.py`**

```python
"""SQLite access for the governance service.

Raw sqlite3 rather than an ORM, matching code/backend/'s dependency-light
style. The schema is small, fixed, and read far more than it is written.
"""
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS orgs (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    admin_password_hash TEXT NOT NULL,
    policy_version      INTEGER NOT NULL DEFAULT 1
);

-- Per-DEPARTMENT, never per-org. The department is encoded in the token so an
-- employee cannot self-declare it, and department is the axis the whole usage
-- dashboard is organised on.
CREATE TABLE IF NOT EXISTS enroll_tokens (
    id         TEXT PRIMARY KEY,
    org_id     TEXT NOT NULL REFERENCES orgs(id),
    department TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked    INTEGER NOT NULL DEFAULT 0
);

-- I3 / spec section 8: pseudo_id and department only. There is deliberately no
-- column here that could hold a name or an email address.
CREATE TABLE IF NOT EXISTS employees (
    id         TEXT PRIMARY KEY,
    org_id     TEXT NOT NULL REFERENCES orgs(id),
    pseudo_id  TEXT NOT NULL UNIQUE,
    department TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_registry (
    id           TEXT PRIMARY KEY,
    host         TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_llm_policy (
    org_id TEXT NOT NULL REFERENCES orgs(id),
    llm_id TEXT NOT NULL REFERENCES llm_registry(id),
    status TEXT NOT NULL CHECK (status IN ('approved', 'blocked')),
    PRIMARY KEY (org_id, llm_id)
);

CREATE TABLE IF NOT EXISTS policy_category (
    org_id  TEXT NOT NULL REFERENCES orgs(id),
    key     TEXT NOT NULL,
    label   TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (org_id, key)
);

CREATE TABLE IF NOT EXISTS access_requests (
    id          TEXT PRIMARY KEY,
    org_id      TEXT NOT NULL REFERENCES orgs(id),
    employee_id TEXT NOT NULL REFERENCES employees(id),
    llm_id      TEXT NOT NULL REFERENCES llm_registry(id),
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied')),
    created_at  TEXT NOT NULL,
    decided_at  TEXT
);

-- finding_hash is a salted hash reference. There is no column for prompt text
-- and there must never be one.
CREATE TABLE IF NOT EXISTS usage_events (
    id           TEXT PRIMARY KEY,
    org_id       TEXT NOT NULL REFERENCES orgs(id),
    employee_id  TEXT NOT NULL REFERENCES employees(id),
    host         TEXT NOT NULL,
    type         TEXT NOT NULL,
    category     TEXT,
    finding_hash TEXT,
    ts           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    token      TEXT PRIMARY KEY,
    org_id     TEXT NOT NULL REFERENCES orgs(id),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_events_org_ts ON usage_events (org_id, ts);
CREATE INDEX IF NOT EXISTS ix_requests_org_status ON access_requests (org_id, status);
"""


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def bump_policy_version(conn: sqlite3.Connection, org_id: str) -> int:
    """Increment and return the org's policy version.

    Every write that changes what an extension would see MUST call this. It is
    the ETag, so a missed bump means a stale client that never refreshes.
    """
    conn.execute(
        "UPDATE orgs SET policy_version = policy_version + 1 WHERE id = ?", (org_id,)
    )
    conn.commit()
    row = conn.execute(
        "SELECT policy_version FROM orgs WHERE id = ?", (org_id,)
    ).fetchone()
    return int(row["policy_version"])
```

- [ ] **Step 6: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_db.py -v
```

Expected: 4 passed.

- [ ] **Step 7: Confirm no database file was created**

```bash
ls policy.db 2>/dev/null && echo "FAIL: conftest.py is not taking effect" || echo "OK: in-memory"
```

Expected: `OK: in-memory`. If a `policy.db` appears, `conftest.py` is in the wrong directory — it must sit in `tests/`, not `tests/unit/` or the project root.

- [ ] **Step 8: Commit**

```bash
git add code/policy/pyproject.toml code/policy/app/__init__.py code/policy/app/db.py code/policy/tests/ .gitignore
git commit -m "feat(policy): sqlite schema and policy-version primitive"
```

---

## Task 2: Secrets — token hashing, password KDF, sessions

**Files:**
- Create: `code/policy/app/security.py`
- Test: `code/policy/tests/test_security.py`

**Interfaces:**
- Consumes: `db.connect`
- Produces: `new_token(prefix: str) -> tuple[str, str]` (plaintext, hash) · `hash_token(token: str) -> str` · `hash_password(pw: str) -> str` · `verify_password(pw: str, stored: str) -> bool` · `issue_session(conn, org_id) -> str` · `session_org(conn, token) -> str | None`

**Why two different hashing strategies — read this before writing the code.** An enrolment token is 160 bits of `secrets` randomness, so a fast hash is fine: there is nothing to guess. An admin password is low-entropy and human-chosen, so a fast hash is brute-forced offline in seconds. It gets `scrypt`. Getting this backwards is the mistake ADR 0009 records against salted-hash codename dictionaries — memorable words plus a fast hash is not protection.

- [ ] **Step 1: Write the failing test**

`code/policy/tests/test_security.py`:

```python
from app.db import connect, init_schema
from app.security import (
    hash_password, hash_token, issue_session, new_token, session_org, verify_password,
)


def test_new_token_is_prefixed_and_its_hash_matches():
    plain, hashed = new_token("ENG")
    assert plain.startswith("ENG-")
    assert hash_token(plain) == hashed


def test_two_tokens_are_never_equal():
    assert new_token("ENG")[0] != new_token("ENG")[0]


def test_password_round_trips_and_rejects_the_wrong_one():
    stored = hash_password("hunter2")
    assert verify_password("hunter2", stored) is True
    assert verify_password("hunter3", stored) is False


def test_password_hash_is_salted_so_two_hashes_of_one_password_differ():
    assert hash_password("hunter2") != hash_password("hunter2")


def test_session_round_trip():
    conn = connect(":memory:")
    init_schema(conn)
    conn.execute(
        "INSERT INTO orgs (id, name, admin_password_hash) VALUES ('o1', 'Acme', 'x')"
    )
    token = issue_session(conn, "o1")
    assert session_org(conn, token) == "o1"
    assert session_org(conn, "not-a-session") is None
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/Scripts/python -m pytest tests/test_security.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.security'`

- [ ] **Step 3: Write `app/security.py`**

```python
"""Hashing and sessions.

Two hashing strategies, deliberately:

  * Enrolment tokens are 160 bits of `secrets` randomness. There is nothing to
    guess, so a fast SHA-256 is correct.
  * The admin password is low-entropy and human-chosen. A fast hash there is
    brute-forced offline, so it gets scrypt. ADR 0009 records this exact error
    being made once already, against codename dictionaries.
"""
import hashlib
import secrets
import sqlite3
from datetime import datetime, timezone

_SCRYPT_N = 2 ** 14
_SCRYPT_R = 8
_SCRYPT_P = 1


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_token(prefix: str) -> tuple[str, str]:
    """Return (plaintext, hash). The plaintext is shown once and never stored."""
    plain = f"{prefix.upper()}-{secrets.token_urlsafe(20)}"
    return plain, hash_token(plain)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(pw.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return f"scrypt${salt.hex()}${dk.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        scheme, salt_hex, want_hex = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    got = hashlib.scrypt(
        pw.encode(), salt=bytes.fromhex(salt_hex),
        n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P,
    )
    return secrets.compare_digest(got.hex(), want_hex)


def issue_session(conn: sqlite3.Connection, org_id: str) -> str:
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO admin_sessions (token, org_id, created_at) VALUES (?, ?, ?)",
        (token, org_id, now_iso()),
    )
    conn.commit()
    return token


def session_org(conn: sqlite3.Connection, token: str | None) -> str | None:
    if not token:
        return None
    row = conn.execute(
        "SELECT org_id FROM admin_sessions WHERE token = ?", (token,)
    ).fetchone()
    return row["org_id"] if row else None
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_security.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add code/policy/app/security.py code/policy/tests/test_security.py
git commit -m "feat(policy): token hashing, scrypt password KDF, admin sessions"
```

---

## Task 3: The LLM registry catalog and demo seed

**Files:**
- Create: `code/policy/app/seed.py`
- Test: `code/policy/tests/test_seed.py`

**Interfaces:**
- Consumes: `db.connect`, `db.init_schema`, `security.hash_password`, `security.new_token`
- Produces: `REGISTRY: list[tuple[str, str, str]]` · `seed_registry(conn) -> None` · `seed_demo_org(conn, name, admin_password) -> str` (returns org_id) · `ETHICS_CATEGORIES: list[tuple[str, str]]`

**The registry is the answer to "why don't you need `<all_urls>`?"** AI surfaces are a known, finite, curated set. Ten rows, not a wildcard.

- [ ] **Step 1: Write the failing test**

`code/policy/tests/test_seed.py`:

```python
from app.db import connect, init_schema
from app.seed import ETHICS_CATEGORIES, REGISTRY, seed_demo_org, seed_registry


def _conn():
    conn = connect(":memory:")
    init_schema(conn)
    return conn


def test_registry_is_finite_and_curated_not_a_wildcard():
    assert 5 <= len(REGISTRY) <= 15
    hosts = [host for _, host, _ in REGISTRY]
    assert "chatgpt.com" in hosts
    assert "claude.ai" in hosts
    assert all("*" not in h for h in hosts)


def test_seed_registry_is_idempotent():
    conn = _conn()
    seed_registry(conn)
    seed_registry(conn)
    count = conn.execute("SELECT COUNT(*) AS n FROM llm_registry").fetchone()["n"]
    assert count == len(REGISTRY)


def test_demo_org_seeds_categories_and_default_tool_policy():
    conn = _conn()
    seed_registry(conn)
    org_id = seed_demo_org(conn, "Acme Corp", "hunter2")

    cats = conn.execute(
        "SELECT COUNT(*) AS n FROM policy_category WHERE org_id = ?", (org_id,)
    ).fetchone()["n"]
    assert cats == len(ETHICS_CATEGORIES)

    approved = conn.execute(
        "SELECT COUNT(*) AS n FROM org_llm_policy WHERE org_id = ? AND status = 'approved'",
        (org_id,),
    ).fetchone()["n"]
    # ChatGPT and Claude approved; everything else blocked, so the demo has an
    # unapproved tool to walk into.
    assert approved == 2
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/Scripts/python -m pytest tests/test_seed.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.seed'`

- [ ] **Step 3: Write `app/seed.py`**

```python
"""Seed data: the curated AI-tool registry and a demo org.

The registry is deliberately a short, explicit list. It is why the extension
asks for eight host permissions instead of <all_urls> -- doc 02 section 6.4's
un-N/A-able security-questionnaire row.
"""
import sqlite3
import uuid

from app.security import hash_password, now_iso

# (id, host, display_name)
REGISTRY: list[tuple[str, str, str]] = [
    ("openai",     "chatgpt.com",       "ChatGPT"),
    ("anthropic",  "claude.ai",         "Claude"),
    ("google",     "gemini.google.com", "Google Gemini"),
    ("microsoft",  "copilot.microsoft.com", "Microsoft Copilot"),
    ("perplexity", "www.perplexity.ai", "Perplexity"),
    ("deepseek",   "chat.deepseek.com", "DeepSeek"),
    ("mistral",    "chat.mistral.ai",   "Le Chat (Mistral)"),
    ("xai",        "grok.com",          "Grok"),
]

# (key, label). The first two are the case study's own named prohibitions.
ETHICS_CATEGORIES: list[tuple[str, str]] = [
    ("covert_surveillance",      "Covert monitoring of employees"),
    ("undisclosed_profiling",    "Profiling people without their knowledge"),
    ("discriminatory_screening", "Screening or ranking people on protected attributes"),
    ("security_evasion",         "Evading security controls or producing exploit code"),
    ("harassment_content",       "Harassing, threatening, or abusive content"),
    ("regulatory_circumvention", "Circumventing legal or regulatory obligations"),
]

_DEFAULT_APPROVED = {"openai", "anthropic"}


def seed_registry(conn: sqlite3.Connection) -> None:
    conn.executemany(
        "INSERT OR IGNORE INTO llm_registry (id, host, display_name) VALUES (?, ?, ?)",
        REGISTRY,
    )
    conn.commit()


def seed_demo_org(conn: sqlite3.Connection, name: str, admin_password: str) -> str:
    org_id = uuid.uuid4().hex
    conn.execute(
        "INSERT INTO orgs (id, name, admin_password_hash, policy_version)"
        " VALUES (?, ?, ?, 1)",
        (org_id, name, hash_password(admin_password)),
    )
    conn.executemany(
        "INSERT INTO org_llm_policy (org_id, llm_id, status) VALUES (?, ?, ?)",
        [
            (org_id, llm_id, "approved" if llm_id in _DEFAULT_APPROVED else "blocked")
            for llm_id, _, _ in REGISTRY
        ],
    )
    conn.executemany(
        "INSERT INTO policy_category (org_id, key, label, enabled) VALUES (?, ?, ?, 1)",
        [(org_id, key, label) for key, label in ETHICS_CATEGORIES],
    )
    conn.commit()
    return org_id
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_seed.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add code/policy/app/seed.py code/policy/tests/test_seed.py
git commit -m "feat(policy): curated LLM registry and demo org seed"
```

---

## Task 4: Models and app wiring

**Files:**
- Create: `code/policy/app/models.py`
- Create: `code/policy/app/main.py`
- Test: `code/policy/tests/test_app.py`

**Interfaces:**
- Consumes: `db`, `seed`
- Produces: `app` (FastAPI) · `get_conn() -> sqlite3.Connection` · models `EnrollRequest`, `EnrollResponse`, `PolicyBody`, `ToolPolicy`, `CategoryPolicy`, `AccessRequestCreate`, `UsageEvent`, `EventBatch`

- [ ] **Step 1: Write the failing test**

`code/policy/tests/test_app.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz():
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/Scripts/python -m pytest tests/test_app.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 3: Write `app/models.py`**

```python
"""Wire models.

The event models are where I3 is enforced structurally: `extra="forbid"` means
a client that tries to send prompt text gets a 422 rather than having the field
silently ignored. A field that is ignored today is a field someone stores
tomorrow.
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EnrollRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str


class ToolPolicy(BaseModel):
    llm_id: str
    host: str
    display_name: str
    status: Literal["approved", "blocked"]


class CategoryPolicy(BaseModel):
    key: str
    label: str
    enabled: bool


class PolicyBody(BaseModel):
    org_id: str
    org_name: str
    version: int
    tools: list[ToolPolicy]
    categories: list[CategoryPolicy]


class EnrollResponse(BaseModel):
    org_id: str
    org_name: str
    pseudo_id: str
    department: str
    policy: PolicyBody


class AccessRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pseudo_id: str
    llm_id: str
    reason: str = Field(max_length=500)


class UsageEvent(BaseModel):
    """One governance event.

    🔴 There is no field for prompt text, and `extra="forbid"` means one cannot
    be smuggled in. `finding_hash` is a salted hash reference (I3).
    """
    model_config = ConfigDict(extra="forbid")

    host: str
    type: Literal["visit_unapproved", "warn_shown", "request_sent", "ethics_block", "pii_block"]
    category: Optional[str] = None
    finding_hash: Optional[str] = None
    ts: str

    @field_validator("finding_hash")
    @classmethod
    def _hash_is_hex64(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if len(v) != 64 or any(c not in "0123456789abcdef" for c in v.lower()):
            raise ValueError("finding_hash must be a 64-character hex digest")
        return v


class EventBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pseudo_id: str
    events: list[UsageEvent] = Field(max_length=100)


class AdminLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    org_name: str
    password: str
```

- [ ] **Step 4: Write `app/main.py`**

```python
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import connect, init_schema
from app.seed import seed_demo_org, seed_registry

# No APM, no body capture. Same posture as code/backend/app/main.py, and this
# module is where a reviewer looks to confirm it.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("vanguard.policy")

DB_PATH = os.environ.get("VANGUARD_POLICY_DB", "policy.db")

_conn = connect(DB_PATH)
init_schema(_conn)
seed_registry(_conn)


def get_conn():
    return _conn


app = FastAPI(title="Vanguard policy", version="0.1.0")

# The extension calls this from its background service worker, whose origin is
# chrome-extension://<id>. Demo-grade: allow all origins. Production pins the
# extension id.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["content-type", "if-none-match", "x-vanguard-session"],
    expose_headers=["etag"],
)


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


def bootstrap_demo(name: str = "Acme Corp", password: str = "vanguard") -> str:
    """Create the demo org if the database has none. Called by scripts/seed.py."""
    row = _conn.execute("SELECT id FROM orgs LIMIT 1").fetchone()
    if row:
        return row["id"]
    org_id = seed_demo_org(_conn, name, password)
    log.info("seeded demo org id=%s", org_id)
    return org_id
```

- [ ] **Step 5: Run the test**

```bash
.venv/Scripts/python -m pytest tests/test_app.py -v
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add code/policy/app/models.py code/policy/app/main.py code/policy/tests/test_app.py
git commit -m "feat(policy): wire models and app bootstrap"
```

---

## Task 5: Enrolment

**Files:**
- Create: `code/policy/app/routes/__init__.py` (empty)
- Create: `code/policy/app/routes/policy_read.py`
- Create: `code/policy/app/routes/enroll.py`
- Modify: `code/policy/app/main.py` — include the router
- Test: `code/policy/tests/test_enroll.py`

**Interfaces:**
- Consumes: `models.EnrollRequest`, `models.EnrollResponse`, `db`, `security.hash_token`
- Produces: `read_policy(conn, org_id) -> PolicyBody` (shared with Task 6) · `POST /v1/enroll`

- [ ] **Step 1: Write the failing test**

`code/policy/tests/test_enroll.py`:

```python
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/Scripts/python -m pytest tests/test_enroll.py -v
```

Expected: 404 on `/v1/enroll` — the route does not exist.

- [ ] **Step 3: Write `app/routes/policy_read.py`**

```python
"""Reading an org's policy. Shared by enrolment and the polling endpoint."""
import sqlite3

from app.models import CategoryPolicy, PolicyBody, ToolPolicy


def read_policy(conn: sqlite3.Connection, org_id: str) -> PolicyBody:
    org = conn.execute(
        "SELECT name, policy_version FROM orgs WHERE id = ?", (org_id,)
    ).fetchone()
    tools = [
        ToolPolicy(
            llm_id=r["id"], host=r["host"],
            display_name=r["display_name"], status=r["status"],
        )
        for r in conn.execute(
            "SELECT r.id, r.host, r.display_name, p.status"
            " FROM llm_registry r JOIN org_llm_policy p ON p.llm_id = r.id"
            " WHERE p.org_id = ? ORDER BY r.display_name",
            (org_id,),
        )
    ]
    categories = [
        CategoryPolicy(key=r["key"], label=r["label"], enabled=bool(r["enabled"]))
        for r in conn.execute(
            "SELECT key, label, enabled FROM policy_category WHERE org_id = ? ORDER BY key",
            (org_id,),
        )
    ]
    return PolicyBody(
        org_id=org_id, org_name=org["name"], version=int(org["policy_version"]),
        tools=tools, categories=categories,
    )
```

- [ ] **Step 4: Write `app/routes/enroll.py`**

```python
import uuid

from fastapi import APIRouter, HTTPException

from app.main import get_conn
from app.models import EnrollRequest, EnrollResponse
from app.routes.policy_read import read_policy
from app.security import hash_token, now_iso

router = APIRouter()


@router.post("/v1/enroll", response_model=EnrollResponse)
async def enroll(body: EnrollRequest) -> EnrollResponse:
    """Exchange a department token for a pseudonymous identity plus policy.

    The department comes from the TOKEN, never from the request body, so an
    employee cannot self-declare which department they are in.
    """
    conn = get_conn()
    row = conn.execute(
        "SELECT org_id, department FROM enroll_tokens"
        " WHERE token_hash = ? AND revoked = 0",
        (hash_token(body.token),),
    ).fetchone()
    if row is None:
        # Log the failure, never the token.
        raise HTTPException(status_code=401, detail="enrolment token not recognised")

    employee_id = uuid.uuid4().hex
    pseudo_id = uuid.uuid4().hex
    conn.execute(
        "INSERT INTO employees (id, org_id, pseudo_id, department, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (employee_id, row["org_id"], pseudo_id, row["department"], now_iso()),
    )
    conn.commit()

    policy = read_policy(conn, row["org_id"])
    return EnrollResponse(
        org_id=row["org_id"], org_name=policy.org_name, pseudo_id=pseudo_id,
        department=row["department"], policy=policy,
    )
```

- [ ] **Step 5: Mount the router in `app/main.py`**

Append to the end of `code/policy/app/main.py`:

```python
from app.routes import enroll as _enroll  # noqa: E402  (import after `app` exists)

app.include_router(_enroll.router)
```

- [ ] **Step 6: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_enroll.py -v
```

Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add code/policy/app/routes/ code/policy/app/main.py code/policy/tests/test_enroll.py
git commit -m "feat(policy): enrolment exchanges a department token for a pseudonymous identity"
```

---

## Task 6: Policy polling with ETag

**Files:**
- Create: `code/policy/app/routes/policy.py`
- Modify: `code/policy/app/main.py` — include the router
- Test: `code/policy/tests/test_policy_etag.py`

**Interfaces:**
- Consumes: `policy_read.read_policy`, `db.bump_policy_version`
- Produces: `GET /v1/policy?org_id=<id>` returning `200` + `ETag` or `304`

**Why this matters:** the extension polls every 30 seconds per device. Without the ETag, that is a full policy body every 30 seconds forever. With it, almost every poll is a bodyless `304`, and a revocation still lands within one cycle.

- [ ] **Step 1: Write the failing test**

`code/policy/tests/test_policy_etag.py`:

```python
from fastapi.testclient import TestClient

from app.db import bump_policy_version
from app.main import app, bootstrap_demo, get_conn

client = TestClient(app)


def test_first_fetch_returns_a_body_and_an_etag():
    org_id = bootstrap_demo()
    r = client.get("/v1/policy", params={"org_id": org_id})
    assert r.status_code == 200
    assert r.headers["etag"]
    assert r.json()["org_id"] == org_id


def test_matching_etag_returns_304_with_no_body():
    org_id = bootstrap_demo()
    etag = client.get("/v1/policy", params={"org_id": org_id}).headers["etag"]
    r = client.get("/v1/policy", params={"org_id": org_id}, headers={"If-None-Match": etag})
    assert r.status_code == 304
    assert r.content == b""


def test_a_policy_change_invalidates_the_etag_within_one_poll():
    org_id = bootstrap_demo()
    etag = client.get("/v1/policy", params={"org_id": org_id}).headers["etag"]
    bump_policy_version(get_conn(), org_id)
    r = client.get("/v1/policy", params={"org_id": org_id}, headers={"If-None-Match": etag})
    assert r.status_code == 200
    assert r.headers["etag"] != etag


def test_unknown_org_is_404():
    assert client.get("/v1/policy", params={"org_id": "nope"}).status_code == 404
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/Scripts/python -m pytest tests/test_policy_etag.py -v
```

Expected: 404 on every case — the route does not exist.

- [ ] **Step 3: Write `app/routes/policy.py`**

```python
from fastapi import APIRouter, Header, HTTPException, Response

from app.main import get_conn
from app.models import PolicyBody
from app.routes.policy_read import read_policy

router = APIRouter()


def _etag(org_id: str, version: int) -> str:
    return f'W/"{org_id}-{version}"'


@router.get("/v1/policy", response_model=PolicyBody)
async def get_policy(
    org_id: str,
    response: Response,
    if_none_match: str | None = Header(default=None),
):
    """Return the org's policy, or 304 if the caller already has this version.

    The ETag is the org's policy_version, so any write that calls
    bump_policy_version() invalidates every client's cache on its next poll.
    """
    conn = get_conn()
    row = conn.execute(
        "SELECT policy_version FROM orgs WHERE id = ?", (org_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="unknown org")

    tag = _etag(org_id, int(row["policy_version"]))
    if if_none_match == tag:
        return Response(status_code=304, headers={"ETag": tag})

    response.headers["ETag"] = tag
    return read_policy(conn, org_id)
```

- [ ] **Step 4: Mount it in `app/main.py`**

```python
from app.routes import policy as _policy  # noqa: E402

app.include_router(_policy.router)
```

- [ ] **Step 5: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_policy_etag.py -v
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add code/policy/app/routes/policy.py code/policy/app/main.py code/policy/tests/test_policy_etag.py
git commit -m "feat(policy): policy endpoint with policy_version as ETag"
```

---

## Task 7: Event ingestion that structurally cannot store prompt text

**Files:**
- Create: `code/policy/app/routes/events.py`
- Modify: `code/policy/app/main.py` — include the router
- Test: `code/policy/tests/test_events.py`

**Interfaces:**
- Consumes: `models.EventBatch`, `models.UsageEvent`
- Produces: `POST /v1/events`

**This task is the I3 invariant in executable form**, and it is modelled on [`test_zero_retention.py`](../../../code/backend/tests/test_zero_retention.py) — a property defended by tests rather than by a comment.

- [ ] **Step 1: Write the failing test**

`code/policy/tests/test_events.py`:

```python
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/Scripts/python -m pytest tests/test_events.py -v
```

Expected: 404 — route missing.

- [ ] **Step 3: Write `app/routes/events.py`**

```python
"""Governance event ingestion.

🔴 I3. `UsageEvent` has no field for prompt text and sets extra="forbid", so a
client attempting to send one receives a 422 instead of having the field
quietly dropped. The rejection is the point: silent tolerance is how a field
becomes a column.
"""
import logging
import uuid

from fastapi import APIRouter, HTTPException

from app.main import get_conn
from app.models import EventBatch

log = logging.getLogger("vanguard.policy")
router = APIRouter()


@router.post("/v1/events", status_code=202)
async def ingest(batch: EventBatch) -> dict[str, int]:
    conn = get_conn()
    row = conn.execute(
        "SELECT id, org_id FROM employees WHERE pseudo_id = ?", (batch.pseudo_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="unknown enrolment")

    conn.executemany(
        "INSERT INTO usage_events"
        " (id, org_id, employee_id, host, type, category, finding_hash, ts)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
            (uuid.uuid4().hex, row["org_id"], row["id"], e.host, e.type,
             e.category, e.finding_hash, e.ts)
            for e in batch.events
        ],
    )
    conn.commit()
    # Count only. Never the host, never the category, never the hash.
    log.info("ingested events n=%d", len(batch.events))
    return {"accepted": len(batch.events)}
```

- [ ] **Step 4: Mount it in `app/main.py`**

```python
from app.routes import events as _events  # noqa: E402

app.include_router(_events.router)
```

- [ ] **Step 5: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_events.py -v
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add code/policy/app/routes/events.py code/policy/app/main.py code/policy/tests/test_events.py
git commit -m "feat(policy): event ingestion that rejects raw prompt text"
```

---

## Task 8: Access requests — employee side

**Files:**
- Create: `code/policy/app/routes/requests.py`
- Modify: `code/policy/app/main.py` — include the router
- Test: `code/policy/tests/test_requests.py`

**Interfaces:**
- Consumes: `models.AccessRequestCreate`
- Produces: `POST /v1/requests`

- [ ] **Step 1: Write the failing test**

`code/policy/tests/test_requests.py`:

```python
import uuid

from fastapi.testclient import TestClient

from app.main import app, bootstrap_demo, get_conn
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


def test_a_duplicate_pending_request_does_not_create_a_second_row():
    pid = _pseudo_id()
    payload = {"pseudo_id": pid, "llm_id": "google", "reason": "again"}
    first = client.post("/v1/requests", json=payload).json()["id"]
    second = client.post("/v1/requests", json=payload).json()["id"]
    assert first == second


def test_an_overlong_reason_is_rejected():
    pid = _pseudo_id()
    r = client.post("/v1/requests", json={
        "pseudo_id": pid, "llm_id": "google", "reason": "x" * 501,
    })
    assert r.status_code == 422
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/Scripts/python -m pytest tests/test_requests.py -v
```

Expected: 404 — route missing.

- [ ] **Step 3: Write `app/routes/requests.py`**

```python
import uuid

from fastapi import APIRouter, HTTPException

from app.main import get_conn
from app.models import AccessRequestCreate
from app.security import now_iso

router = APIRouter()


@router.post("/v1/requests", status_code=201)
async def create_request(body: AccessRequestCreate) -> dict[str, str]:
    conn = get_conn()
    emp = conn.execute(
        "SELECT id, org_id FROM employees WHERE pseudo_id = ?", (body.pseudo_id,)
    ).fetchone()
    if emp is None:
        raise HTTPException(status_code=401, detail="unknown enrolment")

    tool = conn.execute(
        "SELECT id FROM llm_registry WHERE id = ?", (body.llm_id,)
    ).fetchone()
    if tool is None:
        raise HTTPException(status_code=404, detail="unknown tool")

    # One pending request per employee per tool. Clicking twice is not two
    # requests, and the admin queue should not fill with duplicates.
    existing = conn.execute(
        "SELECT id FROM access_requests"
        " WHERE employee_id = ? AND llm_id = ? AND status = 'pending'",
        (emp["id"], body.llm_id),
    ).fetchone()
    if existing:
        return {"id": existing["id"], "status": "pending"}

    request_id = uuid.uuid4().hex
    conn.execute(
        "INSERT INTO access_requests"
        " (id, org_id, employee_id, llm_id, reason, status, created_at)"
        " VALUES (?, ?, ?, ?, ?, 'pending', ?)",
        (request_id, emp["org_id"], emp["id"], body.llm_id, body.reason, now_iso()),
    )
    conn.commit()
    return {"id": request_id, "status": "pending"}
```

- [ ] **Step 4: Mount it in `app/main.py`**

```python
from app.routes import requests as _requests  # noqa: E402

app.include_router(_requests.router)
```

- [ ] **Step 5: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_requests.py -v
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add code/policy/app/routes/requests.py code/policy/app/main.py code/policy/tests/test_requests.py
git commit -m "feat(policy): employee access requests, deduplicated while pending"
```

---

## Task 9: Admin API — auth, tools, tokens, decisions, usage

**Files:**
- Create: `code/policy/app/routes/admin.py`
- Modify: `code/policy/app/main.py` — include the router
- Test: `code/policy/tests/test_admin.py`

**Interfaces:**
- Consumes: `security.verify_password`, `security.issue_session`, `security.session_org`, `security.new_token`, `db.bump_policy_version`
- Produces: `POST /v1/admin/login` · `POST /v1/admin/logout` · `GET /v1/admin/tools` · `POST /v1/admin/tools/{llm_id}` · `GET /v1/admin/tokens` · `POST /v1/admin/tokens` · `POST /v1/admin/tokens/{token_id}/revoke` · `GET /v1/admin/requests` · `POST /v1/admin/requests/{request_id}` · `GET /v1/admin/usage`

**Every mutation here calls `bump_policy_version`.** A write that changes what an extension would see and forgets the bump produces a client that never refreshes — the failure would look like "the demo didn't update" on stage.

- [ ] **Step 1: Write the failing test**

`code/policy/tests/test_admin.py`:

```python
import uuid

from fastapi.testclient import TestClient

from app.main import app, bootstrap_demo, get_conn
from app.security import new_token, now_iso

client = TestClient(app)


def _login() -> TestClient:
    bootstrap_demo("Acme Corp", "vanguard")
    c = TestClient(app)
    r = c.post("/v1/admin/login", json={"org_name": "Acme Corp", "password": "vanguard"})
    assert r.status_code == 200
    return c


def _pseudo_id() -> str:
    org_id = bootstrap_demo()
    plain, hashed = new_token("ENG")
    get_conn().execute(
        "INSERT INTO enroll_tokens (id, org_id, department, token_hash, label, created_at)"
        " VALUES (?, ?, 'Engineering', ?, 'Engineering', ?)",
        (uuid.uuid4().hex, org_id, hashed, now_iso()),
    )
    get_conn().commit()
    return client.post("/v1/enroll", json={"token": plain}).json()["pseudo_id"]


def test_login_with_the_wrong_password_is_401():
    bootstrap_demo("Acme Corp", "vanguard")
    r = client.post("/v1/admin/login", json={"org_name": "Acme Corp", "password": "wrong"})
    assert r.status_code == 401


def test_every_admin_route_refuses_an_unauthenticated_caller():
    fresh = TestClient(app)
    for method, path in [
        ("get", "/v1/admin/tools"), ("get", "/v1/admin/tokens"),
        ("get", "/v1/admin/requests"), ("get", "/v1/admin/usage"),
    ]:
        assert getattr(fresh, method)(path).status_code == 401, path


def test_approving_a_tool_bumps_the_policy_version():
    c = _login()
    org_id = bootstrap_demo()
    before = get_conn().execute(
        "SELECT policy_version AS v FROM orgs WHERE id = ?", (org_id,)
    ).fetchone()["v"]
    r = c.post("/v1/admin/tools/google", json={"status": "approved"})
    assert r.status_code == 200
    after = get_conn().execute(
        "SELECT policy_version AS v FROM orgs WHERE id = ?", (org_id,)
    ).fetchone()["v"]
    assert after > before


def test_minting_a_token_returns_the_plaintext_exactly_once():
    c = _login()
    r = c.post("/v1/admin/tokens", json={"department": "Finance"})
    assert r.status_code == 201
    plain = r.json()["token"]
    assert plain.startswith("FIN-")
    listed = c.get("/v1/admin/tokens").json()
    assert all("token" not in row for row in listed)


def test_deciding_a_request_approves_the_tool_and_bumps_the_version():
    c = _login()
    pid = _pseudo_id()
    req_id = client.post("/v1/requests", json={
        "pseudo_id": pid, "llm_id": "perplexity", "reason": "research",
    }).json()["id"]

    org_id = bootstrap_demo()
    before = get_conn().execute(
        "SELECT policy_version AS v FROM orgs WHERE id = ?", (org_id,)
    ).fetchone()["v"]
    r = c.post(f"/v1/admin/requests/{req_id}", json={"decision": "approved"})
    assert r.status_code == 200

    status = get_conn().execute(
        "SELECT status FROM org_llm_policy WHERE org_id = ? AND llm_id = 'perplexity'",
        (org_id,),
    ).fetchone()["status"]
    assert status == "approved"
    after = get_conn().execute(
        "SELECT policy_version AS v FROM orgs WHERE id = ?", (org_id,)
    ).fetchone()["v"]
    assert after > before


def test_usage_aggregates_by_department_and_category():
    c = _login()
    pid = _pseudo_id()
    client.post("/v1/events", json={"pseudo_id": pid, "events": [
        {"host": "gemini.google.com", "type": "visit_unapproved", "ts": now_iso()},
        {"host": "chatgpt.com", "type": "ethics_block",
         "category": "covert_surveillance", "ts": now_iso()},
    ]})
    body = c.get("/v1/admin/usage").json()
    assert any(d["department"] == "Engineering" for d in body["by_department"])
    assert any(x["category"] == "covert_surveillance" for x in body["by_category"])
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/Scripts/python -m pytest tests/test_admin.py -v
```

Expected: 404 on every admin route.

- [ ] **Step 3: Write `app/routes/admin.py`**

```python
"""Admin API.

🔴 Authority is decided HERE, server-side, on every request. The console is a
view; it never adjudicates whether its user is an admin. A client-side admin
check is bypassed with devtools in under a minute and would ship a control
whose audit trail claims it worked -- doc 00 section 6's worst case.
"""
import uuid

from fastapi import APIRouter, Body, Cookie, HTTPException, Response

from app.db import bump_policy_version
from app.main import get_conn
from app.models import AdminLogin
from app.security import issue_session, new_token, now_iso, session_org, verify_password

router = APIRouter(prefix="/v1/admin")
SESSION_COOKIE = "vg_admin"


def _require_admin(session: str | None) -> str:
    org_id = session_org(get_conn(), session)
    if org_id is None:
        raise HTTPException(status_code=401, detail="admin session required")
    return org_id


@router.post("/login")
async def login(body: AdminLogin, response: Response) -> dict[str, str]:
    conn = get_conn()
    row = conn.execute(
        "SELECT id, admin_password_hash FROM orgs WHERE name = ?", (body.org_name,)
    ).fetchone()
    if row is None or not verify_password(body.password, row["admin_password_hash"]):
        raise HTTPException(status_code=401, detail="invalid credentials")
    token = issue_session(conn, row["id"])
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="lax")
    return {"org_id": row["id"], "org_name": body.org_name}


@router.post("/logout")
async def logout(response: Response, vg_admin: str | None = Cookie(default=None)) -> dict[str, bool]:
    if vg_admin:
        get_conn().execute("DELETE FROM admin_sessions WHERE token = ?", (vg_admin,))
        get_conn().commit()
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@router.get("/tools")
async def list_tools(vg_admin: str | None = Cookie(default=None)) -> list[dict]:
    org_id = _require_admin(vg_admin)
    return [dict(r) for r in get_conn().execute(
        "SELECT r.id AS llm_id, r.host, r.display_name, p.status"
        " FROM llm_registry r JOIN org_llm_policy p ON p.llm_id = r.id"
        " WHERE p.org_id = ? ORDER BY r.display_name",
        (org_id,),
    )]


@router.post("/tools/{llm_id}")
async def set_tool(
    llm_id: str,
    status: str = Body(embed=True),
    vg_admin: str | None = Cookie(default=None),
) -> dict[str, int]:
    org_id = _require_admin(vg_admin)
    if status not in ("approved", "blocked"):
        raise HTTPException(status_code=422, detail="status must be approved or blocked")
    conn = get_conn()
    conn.execute(
        "UPDATE org_llm_policy SET status = ? WHERE org_id = ? AND llm_id = ?",
        (status, org_id, llm_id),
    )
    conn.commit()
    return {"version": bump_policy_version(conn, org_id)}


@router.get("/tokens")
async def list_tokens(vg_admin: str | None = Cookie(default=None)) -> list[dict]:
    """Never returns plaintext. The token is shown once, at mint time."""
    org_id = _require_admin(vg_admin)
    return [dict(r) for r in get_conn().execute(
        "SELECT id, department, label, created_at, revoked FROM enroll_tokens"
        " WHERE org_id = ? ORDER BY created_at DESC",
        (org_id,),
    )]


@router.post("/tokens", status_code=201)
async def mint_token(
    department: str = Body(embed=True),
    vg_admin: str | None = Cookie(default=None),
) -> dict[str, str]:
    org_id = _require_admin(vg_admin)
    plain, hashed = new_token(department[:3])
    token_id = uuid.uuid4().hex
    conn = get_conn()
    conn.execute(
        "INSERT INTO enroll_tokens (id, org_id, department, token_hash, label, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (token_id, org_id, department, hashed, department, now_iso()),
    )
    conn.commit()
    return {"id": token_id, "department": department, "token": plain}


@router.post("/tokens/{token_id}/revoke")
async def revoke_token(token_id: str, vg_admin: str | None = Cookie(default=None)) -> dict[str, bool]:
    org_id = _require_admin(vg_admin)
    conn = get_conn()
    conn.execute(
        "UPDATE enroll_tokens SET revoked = 1 WHERE id = ? AND org_id = ?",
        (token_id, org_id),
    )
    conn.commit()
    return {"ok": True}


@router.get("/requests")
async def list_requests(vg_admin: str | None = Cookie(default=None)) -> list[dict]:
    org_id = _require_admin(vg_admin)
    return [dict(r) for r in get_conn().execute(
        "SELECT a.id, a.reason, a.status, a.created_at, e.department,"
        "       r.display_name, r.host, a.llm_id"
        " FROM access_requests a"
        " JOIN employees e ON e.id = a.employee_id"
        " JOIN llm_registry r ON r.id = a.llm_id"
        " WHERE a.org_id = ? ORDER BY a.created_at DESC",
        (org_id,),
    )]


@router.post("/requests/{request_id}")
async def decide_request(
    request_id: str,
    decision: str = Body(embed=True),
    vg_admin: str | None = Cookie(default=None),
) -> dict[str, int]:
    org_id = _require_admin(vg_admin)
    if decision not in ("approved", "denied"):
        raise HTTPException(status_code=422, detail="decision must be approved or denied")
    conn = get_conn()
    row = conn.execute(
        "SELECT llm_id FROM access_requests WHERE id = ? AND org_id = ?",
        (request_id, org_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="unknown request")

    conn.execute(
        "UPDATE access_requests SET status = ?, decided_at = ? WHERE id = ?",
        (decision, now_iso(), request_id),
    )
    if decision == "approved":
        conn.execute(
            "UPDATE org_llm_policy SET status = 'approved'"
            " WHERE org_id = ? AND llm_id = ?",
            (org_id, row["llm_id"]),
        )
    conn.commit()
    return {"version": bump_policy_version(conn, org_id)}


@router.get("/usage")
async def usage(vg_admin: str | None = Cookie(default=None)) -> dict[str, list[dict]]:
    org_id = _require_admin(vg_admin)
    conn = get_conn()
    by_department = [dict(r) for r in conn.execute(
        "SELECT e.department, COUNT(*) AS events"
        " FROM usage_events u JOIN employees e ON e.id = u.employee_id"
        " WHERE u.org_id = ? GROUP BY e.department ORDER BY events DESC",
        (org_id,),
    )]
    by_tool = [dict(r) for r in conn.execute(
        "SELECT host, COUNT(*) AS events FROM usage_events"
        " WHERE org_id = ? GROUP BY host ORDER BY events DESC",
        (org_id,),
    )]
    by_category = [dict(r) for r in conn.execute(
        "SELECT category, COUNT(*) AS events FROM usage_events"
        " WHERE org_id = ? AND category IS NOT NULL"
        " GROUP BY category ORDER BY events DESC",
        (org_id,),
    )]
    return {"by_department": by_department, "by_tool": by_tool, "by_category": by_category}
```

- [ ] **Step 4: Mount it in `app/main.py`**

```python
from app.routes import admin as _admin  # noqa: E402

app.include_router(_admin.router)
```

- [ ] **Step 5: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_admin.py -v
```

Expected: 7 passed.

- [ ] **Step 6: Run the whole suite**

```bash
.venv/Scripts/python -m pytest -v
```

Expected: all passed (28 tests across seven files).

- [ ] **Step 7: Commit**

```bash
git add code/policy/app/routes/admin.py code/policy/app/main.py code/policy/tests/test_admin.py
git commit -m "feat(policy): admin API for auth, tools, tokens, decisions, and usage"
```

---

## Task 10: Admin console — scaffold and login

**Files:**
- Create: `code/policy/admin/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `code/policy/admin/src/api.ts`
- Create: `code/policy/admin/src/main.tsx`
- Create: `code/policy/admin/src/screens/Login.tsx`

**Interfaces:**
- Consumes: the admin API from Task 9
- Produces: `api.get<T>(path)` · `api.post<T>(path, body)` · `<App/>` shell with a `screen` state machine

Preact rather than React, matching [`code/extension/entrypoints/options/main.tsx`](../../../code/extension/entrypoints/options/main.tsx) — one UI idiom across the project.

- [ ] **Step 1: Create the build files**

`code/policy/admin/package.json`:

```json
{
  "name": "vanguard-admin",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "preact": "^10.24.0"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.9.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

`code/policy/admin/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  // Built into the service's static dir so one process serves API and console.
  build: { outDir: '../app/static', emptyOutDir: true },
  server: {
    // `npm run dev` proxies the API so the console can hot-reload against a
    // running service.
    proxy: { '/v1': 'http://localhost:8001' },
  },
});
```

`code/policy/admin/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`code/policy/admin/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vanguard — AI Governance</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the API client**

`code/policy/admin/src/api.ts`:

```typescript
/** Typed fetch wrapper. `credentials: 'include'` carries the HttpOnly session
 *  cookie the admin login sets — the console never holds a token itself. */
async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) throw new Error('unauthorised');
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status}`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  get: <T,>(path: string) => call<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => call<T>('POST', path, body),
};

export type Tool = {
  llm_id: string; host: string; display_name: string;
  status: 'approved' | 'blocked';
};
export type TokenRow = {
  id: string; department: string; label: string; created_at: string; revoked: number;
};
export type RequestRow = {
  id: string; reason: string; status: 'pending' | 'approved' | 'denied';
  created_at: string; department: string; display_name: string;
  host: string; llm_id: string;
};
export type Usage = {
  by_department: { department: string; events: number }[];
  by_tool: { host: string; events: number }[];
  by_category: { category: string; events: number }[];
};
```

- [ ] **Step 3: Write the login screen**

`code/policy/admin/src/screens/Login.tsx`:

```tsx
import { useState } from 'preact/hooks';
import { api } from '../api';

export function Login({ onDone }: { onDone: (org: string) => void }) {
  const [orgName, setOrgName] = useState('Acme Corp');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: Event) {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post<{ org_name: string }>('/v1/admin/login', {
        org_name: orgName, password,
      });
      onDone(r.org_name);
    } catch {
      setError('Organisation or password not recognised.');
    }
  }

  return (
    <form class="card" onSubmit={submit}>
      <h1>Vanguard — AI Governance</h1>
      <label>Organisation<input value={orgName}
        onInput={(e) => setOrgName((e.target as HTMLInputElement).value)} /></label>
      <label>Admin password<input type="password" value={password}
        onInput={(e) => setPassword((e.target as HTMLInputElement).value)} /></label>
      <button type="submit">Sign in</button>
      {error && <p class="error">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Write the shell**

`code/policy/admin/src/main.tsx`:

```tsx
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { Login } from './screens/Login';
import './style.css';

type Screen = 'tools' | 'requests' | 'usage' | 'tokens';

function App() {
  const [org, setOrg] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('tools');

  if (!org) return <Login onDone={setOrg} />;

  return (
    <div class="shell">
      <nav>
        <strong>{org}</strong>
        {(['tools', 'requests', 'usage', 'tokens'] as Screen[]).map((s) => (
          <button class={screen === s ? 'active' : ''} onClick={() => setScreen(s)}>{s}</button>
        ))}
      </nav>
      <main>
        {/* Screens land in Tasks 11-13. */}
        {screen === 'tools' && <p>Tools</p>}
        {screen === 'requests' && <p>Requests</p>}
        {screen === 'usage' && <p>Usage</p>}
        {screen === 'tokens' && <p>Tokens</p>}
      </main>
    </div>
  );
}

render(<App />, document.getElementById('root')!);
```

`code/policy/admin/src/style.css`:

```css
:root { font-family: system-ui, sans-serif; color: #0f172a; }
body { margin: 0; background: #f8fafc; }
.card { max-width: 380px; margin: 12vh auto; background: #fff; padding: 28px;
        border-radius: 12px; box-shadow: 0 1px 3px rgb(15 23 42 / 12%); }
.card label { display: block; margin: 14px 0; font-size: 14px; }
.card input { width: 100%; padding: 8px; margin-top: 4px;
              border: 1px solid #cbd5e1; border-radius: 6px; }
button { padding: 8px 14px; border: none; border-radius: 6px;
         background: #e11d48; color: #fff; cursor: pointer; }
.error { color: #b91c1c; font-size: 14px; }
.shell nav { display: flex; gap: 8px; align-items: center; padding: 12px 20px;
             background: #fff; border-bottom: 1px solid #e2e8f0; }
.shell nav button { background: transparent; color: #475569; text-transform: capitalize; }
.shell nav button.active { background: #e11d48; color: #fff; }
main { padding: 24px; }
table { border-collapse: collapse; width: 100%; background: #fff; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
.pill { padding: 2px 8px; border-radius: 999px; font-size: 12px; }
.pill.approved { background: #dcfce7; color: #166534; }
.pill.blocked { background: #fee2e2; color: #991b1b; }
```

- [ ] **Step 5: Verify it builds and runs**

```bash
cd code/policy/admin && npm install && npm run build
```

Expected: `vite build` succeeds and writes into `code/policy/app/static/`.

- [ ] **Step 6: Commit**

```bash
git add code/policy/admin/
git commit -m "feat(policy): admin console scaffold and login screen"
```

---

## Task 11: Admin console — Tools and Tokens screens

**Files:**
- Create: `code/policy/admin/src/screens/Tools.tsx`
- Create: `code/policy/admin/src/screens/Tokens.tsx`
- Modify: `code/policy/admin/src/main.tsx` — render them

**Interfaces:**
- Consumes: `api`, `Tool`, `TokenRow` from Task 10
- Produces: `<Tools/>`, `<Tokens/>`

- [ ] **Step 1: Write `Tools.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks';
import { api, type Tool } from '../api';

export function Tools() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [busy, setBusy] = useState('');

  async function load() { setTools(await api.get<Tool[]>('/v1/admin/tools')); }
  useEffect(() => { void load(); }, []);

  async function toggle(tool: Tool) {
    setBusy(tool.llm_id);
    const status = tool.status === 'approved' ? 'blocked' : 'approved';
    await api.post(`/v1/admin/tools/${tool.llm_id}`, { status });
    await load();
    setBusy('');
  }

  return (
    <>
      <h2>AI tools</h2>
      <p>Approved tools are usable without a warning. Blocked tools show a banner
         and offer the employee a one-click access request.</p>
      <table>
        <thead><tr><th>Tool</th><th>Host</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.llm_id}>
              <td>{t.display_name}</td>
              <td><code>{t.host}</code></td>
              <td><span class={`pill ${t.status}`}>{t.status}</span></td>
              <td>
                <button disabled={busy === t.llm_id} onClick={() => toggle(t)}>
                  {t.status === 'approved' ? 'Block' : 'Approve'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
```

- [ ] **Step 2: Write `Tokens.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks';
import { api, type TokenRow } from '../api';

export function Tokens() {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [department, setDepartment] = useState('Engineering');
  const [minted, setMinted] = useState('');

  async function load() { setRows(await api.get<TokenRow[]>('/v1/admin/tokens')); }
  useEffect(() => { void load(); }, []);

  async function mint() {
    const r = await api.post<{ token: string }>('/v1/admin/tokens', { department });
    setMinted(r.token);   // shown once; the server stores only its hash
    await load();
  }

  return (
    <>
      <h2>Enrolment tokens</h2>
      <p>One token per department. The department is encoded in the token, so an
         employee cannot choose their own.</p>
      <div>
        <input value={department}
               onInput={(e) => setDepartment((e.target as HTMLInputElement).value)} />
        <button onClick={mint}>Mint token</button>
      </div>
      {minted && (
        <p class="card">
          <strong>Copy this now — it is not shown again:</strong><br />
          <code>{minted}</code>
        </p>
      )}
      <table>
        <thead><tr><th>Department</th><th>Created</th><th>State</th><th></th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.department}</td>
              <td>{new Date(row.created_at).toLocaleString()}</td>
              <td>{row.revoked ? 'revoked' : 'active'}</td>
              <td>
                {!row.revoked && (
                  <button onClick={async () => {
                    await api.post(`/v1/admin/tokens/${row.id}/revoke`);
                    await load();
                  }}>Revoke</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
```

- [ ] **Step 3: Wire them into `main.tsx`**

Replace the placeholder lines in `code/policy/admin/src/main.tsx`:

```tsx
import { Tools } from './screens/Tools';
import { Tokens } from './screens/Tokens';
```

```tsx
        {screen === 'tools' && <Tools />}
        {screen === 'requests' && <p>Requests</p>}
        {screen === 'usage' && <p>Usage</p>}
        {screen === 'tokens' && <Tokens />}
```

- [ ] **Step 4: Verify by hand**

```bash
cd code/policy && .venv/Scripts/python -c "from app.main import bootstrap_demo; print(bootstrap_demo())"
.venv/Scripts/python -m uvicorn app.main:app --port 8001 &
cd admin && npm run dev
```

Open the dev URL, sign in as `Acme Corp` / `vanguard`. Expected: eight tools listed, ChatGPT and Claude approved, the rest blocked. Toggle one and confirm the pill changes. Mint a Finance token and confirm the plaintext appears once and never in the table.

- [ ] **Step 5: Commit**

```bash
git add code/policy/admin/src/
git commit -m "feat(policy): admin tools and enrolment-token screens"
```

---

## Task 12: Admin console — Requests screen

**Files:**
- Create: `code/policy/admin/src/screens/Requests.tsx`
- Modify: `code/policy/admin/src/main.tsx`

**Interfaces:**
- Consumes: `api`, `RequestRow`
- Produces: `<Requests/>`

**This screen is the demo's pivot.** The employee's request appears here; approving it unblocks their tab. It polls every 3 seconds so the request shows up on stage without anyone clicking refresh.

- [ ] **Step 1: Write `Requests.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks';
import { api, type RequestRow } from '../api';

export function Requests() {
  const [rows, setRows] = useState<RequestRow[]>([]);

  async function load() { setRows(await api.get<RequestRow[]>('/v1/admin/requests')); }

  useEffect(() => {
    void load();
    // Poll so a request raised on the employee laptop appears without a manual
    // refresh. 3s (estimate) -- fast enough to feel live on stage.
    const timer = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(timer);
  }, []);

  async function decide(id: string, decision: 'approved' | 'denied') {
    await api.post(`/v1/admin/requests/${id}`, { decision });
    await load();
  }

  const pending = rows.filter((r) => r.status === 'pending');

  return (
    <>
      <h2>Access requests</h2>
      {pending.length === 0 && <p>No pending requests.</p>}
      <table>
        <thead>
          <tr><th>Department</th><th>Tool</th><th>Reason</th><th>Raised</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.department}</td>
              <td>{r.display_name}</td>
              <td>{r.reason}</td>
              <td>{new Date(r.created_at).toLocaleTimeString()}</td>
              <td>
                {r.status === 'pending' ? (
                  <>
                    <button onClick={() => decide(r.id, 'approved')}>Approve</button>{' '}
                    <button onClick={() => decide(r.id, 'denied')}>Deny</button>
                  </>
                ) : (
                  <span class={`pill ${r.status === 'approved' ? 'approved' : 'blocked'}`}>
                    {r.status}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
```

- [ ] **Step 2: Wire it into `main.tsx`**

```tsx
import { Requests } from './screens/Requests';
```

```tsx
        {screen === 'requests' && <Requests />}
```

- [ ] **Step 3: Verify by hand**

With the service running, create a request and confirm it appears within ~3 seconds without refreshing.

**Everything below goes over HTTP.** Do not open the database directly while `uvicorn` holds it — that risks a lock, and against the in-memory database of a test run it would address a different database entirely.

Take an Engineering token from the `scripts/seed.py` output (Task 14), then:

```bash
cd code/policy
.venv/Scripts/python - <<'PY'
import httpx

BASE = "http://localhost:8001"
TOKEN = "ENG-paste-a-token-from-scripts/seed.py-here"

pid = httpx.post(f"{BASE}/v1/enroll", json={"token": TOKEN}).json()["pseudo_id"]
print("enrolled:", pid)
print(httpx.post(f"{BASE}/v1/requests", json={
    "pseudo_id": pid, "llm_id": "google", "reason": "Translation QA",
}).json())
PY
```

Expected: the row appears in the Requests screen within 3 seconds. Approving it flips Gemini to `approved` on the Tools screen.

⚠️ **If you have not run Task 14 yet**, mint a token through the console's Tokens screen instead — it is the same operation and needs no shell.

- [ ] **Step 4: Commit**

```bash
git add code/policy/admin/src/
git commit -m "feat(policy): admin access-request queue with live polling"
```

---

## Task 13: Admin console — Usage screen

**Files:**
- Create: `code/policy/admin/src/screens/Usage.tsx`
- Modify: `code/policy/admin/src/main.tsx`

**Interfaces:**
- Consumes: `api`, `Usage`
- Produces: `<Usage/>`

Plain bar rows rather than a charting library — no dependency, no CSP question, and it reads clearly on a projector.

- [ ] **Step 1: Write `Usage.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks';
import { api, type Usage as UsageData } from '../api';

function Bars({ title, rows }: { title: string; rows: { label: string; events: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.events));
  return (
    <section>
      <h3>{title}</h3>
      {rows.length === 0 && <p>No events yet.</p>}
      {rows.map((r) => (
        <div key={r.label} style="display:flex;align-items:center;gap:10px;margin:6px 0">
          <span style="width:220px;font-size:14px">{r.label}</span>
          <span style={`height:14px;border-radius:3px;background:#e11d48;width:${
            (r.events / max) * 320}px`} />
          <span style="font-size:13px;color:#475569">{r.events}</span>
        </div>
      ))}
    </section>
  );
}

export function Usage() {
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    const load = async () => setData(await api.get<UsageData>('/v1/admin/usage'));
    void load();
    const timer = setInterval(() => { void load(); }, 3000); // (estimate)
    return () => clearInterval(timer);
  }, []);

  if (!data) return <p>Loading…</p>;

  return (
    <>
      <h2>AI usage</h2>
      <p>Events carry a class, a count, and a salted hash — never prompt text.</p>
      <Bars title="By department"
            rows={data.by_department.map((r) => ({ label: r.department, events: r.events }))} />
      <Bars title="By tool"
            rows={data.by_tool.map((r) => ({ label: r.host, events: r.events }))} />
      <Bars title="By policy category"
            rows={data.by_category.map((r) => ({ label: r.category, events: r.events }))} />
    </>
  );
}
```

- [ ] **Step 2: Wire it into `main.tsx`**

```tsx
import { Usage } from './screens/Usage';
```

```tsx
        {screen === 'usage' && <Usage />}
```

- [ ] **Step 3: Verify by hand**

Post two events with the snippet from Task 9's test, then open the Usage screen. Expected: `Engineering` appears under By department, and `covert_surveillance` under By policy category.

- [ ] **Step 4: Commit**

```bash
git add code/policy/admin/src/
git commit -m "feat(policy): admin usage dashboard by department, tool, and category"
```

---

## Task 14: Serve the console, seed script, README

**Files:**
- Modify: `code/policy/app/main.py` — mount static files
- Create: `code/policy/scripts/seed.py`
- Create: `code/policy/README.md`
- Test: `code/policy/tests/test_static.py`

**Interfaces:**
- Consumes: everything above
- Produces: one process serving both API and console

- [ ] **Step 1: Write the failing test**

`code/policy/tests/test_static.py`:

```python
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
STATIC = Path(__file__).parent.parent / "app" / "static"


def test_console_is_served_at_root_when_built():
    if not (STATIC / "index.html").exists():
        import pytest
        pytest.skip("console not built; run `npm run build` in admin/")
    r = client.get("/")
    assert r.status_code == 200
    assert "<div id=\"root\">" in r.text


def test_api_routes_still_win_over_the_static_mount():
    assert client.get("/healthz").json() == {"ok": True}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd code/policy && .venv/Scripts/python -m pytest tests/test_static.py -v
```

Expected: the first test fails with 404 (or skips if the console is unbuilt); the second passes.

- [ ] **Step 3: Mount static files in `app/main.py`**

Append, **after every `include_router` call** — the static mount at `/` must be registered last or it shadows the API routes:

```python
from pathlib import Path  # noqa: E402

from fastapi.staticfiles import StaticFiles  # noqa: E402

_STATIC = Path(__file__).parent / "static"
if _STATIC.exists():
    # Registered LAST so /v1/* and /healthz resolve first.
    app.mount("/", StaticFiles(directory=str(_STATIC), html=True), name="console")
```

- [ ] **Step 4: Write the seed script**

`code/policy/scripts/seed.py`:

```python
"""Create the demo org and one token per department.

Run once before a demo:  python scripts/seed.py
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.main import bootstrap_demo, get_conn          # noqa: E402
from app.security import new_token, now_iso            # noqa: E402

DEPARTMENTS = ["Engineering", "Finance", "Marketing", "Legal"]

org_id = bootstrap_demo("Acme Corp", "vanguard")
print(f"org: Acme Corp  ({org_id})")
print("admin password: vanguard")

for department in DEPARTMENTS:
    plain, hashed = new_token(department[:3])
    get_conn().execute(
        "INSERT INTO enroll_tokens (id, org_id, department, token_hash, label, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (uuid.uuid4().hex, org_id, department, hashed, department, now_iso()),
    )
    print(f"  {department:<12} {plain}")
get_conn().commit()
```

- [ ] **Step 5: Write the README**

`code/policy/README.md`:

````markdown
# `policy/` — AI governance service

Org identity, AI-tool policy, approval workflow, and usage events. Serves the
admin console at `/`.

**Spec:** [`docs/superpowers/specs/2026-07-19-ai-governance-platform-design.md`](../../docs/superpowers/specs/2026-07-19-ai-governance-platform-design.md)

## The boundary with `backend/` — do not merge these

`backend/` parses files and keeps nothing;
[`test_zero_retention.py`](../backend/tests/test_zero_retention.py) defends that
in executable form. This service is the opposite: org state is its whole job.

Note that `backend/README.md` describes itself as *"policy, dictionary, and
hashed audit ingest"* — that is **this** service. What was built under
`backend/` is the file pipeline. The split is deliberate, not accidental.

## Run it

```bash
python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"
cd admin && npm install && npm run build && cd ..
.venv/Scripts/python scripts/seed.py          # prints the department tokens
.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

`--host 0.0.0.0` is required for the two-laptop demo (spec §5.4).

## Standing constraints

- 🔴 **I3: classes, counts, salted hashes. NEVER prompt text.** `UsageEvent` sets
  `extra="forbid"`, so an event carrying a `prompt` field is **rejected**, not
  ignored. `tests/test_events.py` is that rule in executable form.
- 🔴 **Admin authority is server-side, on every request.** The console is a view.
- **Employees are pseudonymous.** No name or email column exists in `employees`.
- **Every policy write calls `bump_policy_version()`.** It is the ETag; a missed
  bump is a client that never refreshes.
- **Demo-grade.** SQLite, one admin password per org, no SSO. Spec §9 carries the
  honest answer for each.
````

- [ ] **Step 6: Run everything**

```bash
cd code/policy/admin && npm run build && cd ..
.venv/Scripts/python -m pytest -v
```

Expected: all tests pass, including both static tests now that the console is built.

- [ ] **Step 7: Commit**

```bash
git add code/policy/app/main.py code/policy/scripts/ code/policy/README.md code/policy/tests/test_static.py
git commit -m "feat(policy): serve the console, add the demo seed script and README"
```

---

## Task 15: End-to-end walkthrough

**Files:**
- Create: `code/policy/tests/test_end_to_end.py`

**Interfaces:**
- Consumes: every route
- Produces: one test proving the demo narrative works without a browser

**Why this exists:** Tasks 5–9 each test one route. None proves the *sequence* — mint, enrol, hit a blocked tool, request, approve, see the version change. That sequence is the demo, and per CLAUDE.md §2 ledger #11 a test that never drives the real boundary certifies the half that was not broken.

- [ ] **Step 1: Write the test**

`code/policy/tests/test_end_to_end.py`:

```python
"""The demo narrative, end to end, with no browser.

mint token -> enrol -> Gemini is blocked -> request -> admin approves ->
policy version changes -> Gemini is approved.
"""
from fastapi.testclient import TestClient

from app.main import app, bootstrap_demo

employee = TestClient(app)
admin = TestClient(app)


def test_the_whole_demo_sequence():
    bootstrap_demo("Acme Corp", "vanguard")
    assert admin.post("/v1/admin/login", json={
        "org_name": "Acme Corp", "password": "vanguard",
    }).status_code == 200

    # 1. Admin mints a department token.
    token = admin.post("/v1/admin/tokens", json={"department": "Engineering"}).json()["token"]

    # 2. Employee enrols. Department comes from the token.
    enrolled = employee.post("/v1/enroll", json={"token": token}).json()
    pseudo_id, org_id = enrolled["pseudo_id"], enrolled["org_id"]
    assert enrolled["department"] == "Engineering"

    # 3. Gemini starts blocked, so there is something to walk into.
    tools = {t["llm_id"]: t["status"] for t in enrolled["policy"]["tools"]}
    assert tools["google"] == "blocked"
    version_before = enrolled["policy"]["version"]

    # 4. The visit is recorded, carrying no prompt text.
    assert employee.post("/v1/events", json={
        "pseudo_id": pseudo_id,
        "events": [{"host": "gemini.google.com", "type": "visit_unapproved",
                    "ts": "2026-07-19T10:00:00+00:00"}],
    }).status_code == 202

    # 5. Employee requests access.
    request_id = employee.post("/v1/requests", json={
        "pseudo_id": pseudo_id, "llm_id": "google", "reason": "Translation QA",
    }).json()["id"]

    # 6. It reaches the admin queue.
    queue = admin.get("/v1/admin/requests").json()
    assert any(r["id"] == request_id and r["department"] == "Engineering" for r in queue)

    # 7. Admin approves.
    assert admin.post(f"/v1/admin/requests/{request_id}",
                      json={"decision": "approved"}).status_code == 200

    # 8. The employee's next poll sees a new version and an approved Gemini.
    refreshed = employee.get("/v1/policy", params={"org_id": org_id}).json()
    assert refreshed["version"] > version_before
    assert {t["llm_id"]: t["status"] for t in refreshed["tools"]}["google"] == "approved"

    # 9. The usage dashboard attributes it to the right department.
    usage = admin.get("/v1/admin/usage").json()
    assert any(d["department"] == "Engineering" for d in usage["by_department"])
```

- [ ] **Step 2: Run it**

```bash
cd code/policy && .venv/Scripts/python -m pytest tests/test_end_to_end.py -v
```

Expected: 1 passed.

- [ ] **Step 3: Run the full suite one final time**

```bash
.venv/Scripts/python -m pytest -v
```

Expected: all passed. Confirm `code/backend`'s suite is untouched:

```bash
cd ../backend && .venv/Scripts/python -m pytest -q
```

Expected: still passing — Plan A modified nothing there.

- [ ] **Step 4: Commit**

```bash
git add code/policy/tests/test_end_to_end.py
git commit -m "test(policy): end-to-end demo sequence from token mint to approval"
```

---

## What Plan A does not do

Deliberately deferred, so nobody implements them here:

- **The extension knows nothing about this service yet.** Enrolment UI, the policy client in the background service worker, registry detection, the warn banner, and event shipping are **Plan B**.
- **The ethics classifier does not exist.** `policy_category` rows are seeded and the `ethics_block` event type is accepted, but nothing produces one yet — **Plan C**.
- **ADR 0029** (recording the ADR 0016 sequencing departure) is written when Plan B starts, since that is where the extension itself changes.
- **No `host_permissions` change.** That is a manifest edit and belongs with Plan B, alongside spec §5.4's LAN-plus-tunnel origins decision.
