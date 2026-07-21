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
