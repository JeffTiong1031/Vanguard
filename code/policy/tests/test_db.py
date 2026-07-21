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


def test_decision_appeals_table_exists_with_expected_columns():
    conn = _conn()
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(decision_appeals)")}
    assert cols == {
        "id", "org_id", "employee_id", "decision_type", "category",
        "employee_reason", "disclosed_text", "status", "admin_note",
        "created_at", "decided_at",
    }
