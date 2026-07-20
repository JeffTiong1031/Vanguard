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

# Safe to run twice. Re-running used to mint a SECOND full set of department
# tokens on top of the first -- both sets work, the Tokens screen then shows
# eight rows, and the operator demos from whichever printout they happen to
# be holding. Mint only for departments that don't already have an unrevoked
# token for this org.
for department in DEPARTMENTS:
    existing = get_conn().execute(
        "SELECT 1 FROM enroll_tokens WHERE org_id = ? AND department = ? AND revoked = 0",
        (org_id, department),
    ).fetchone()
    if existing:
        print(f"  {department:<12} already has a token -- skipping."
              " Delete policy.db to start fresh.")
        continue
    plain, hashed = new_token(department[:3])
    get_conn().execute(
        "INSERT INTO enroll_tokens (id, org_id, department, token_hash, label, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (uuid.uuid4().hex, org_id, department, hashed, department, now_iso()),
    )
    print(f"  {department:<12} {plain}")
get_conn().commit()
