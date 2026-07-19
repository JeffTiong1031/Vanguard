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
