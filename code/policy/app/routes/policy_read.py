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
