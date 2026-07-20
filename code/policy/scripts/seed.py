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
