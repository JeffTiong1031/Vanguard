"""Employee-facing appeals against automated enforcement decisions.

An appeal carries the finding CLASS and the employee's own reason. It carries
prompt text ONLY when the employee ticked the opt-in box in the modal, arriving
here as `disclosed_text`. `AppealCreate` sets extra="forbid", so the prompt
cannot be smuggled under any other key -- I3 holds by construction.
"""
import uuid

from fastapi import APIRouter, HTTPException

from app.deps import get_conn
from app.models import AllowanceConsume, AppealCreate
from app.security import now_iso

router = APIRouter()


def _employee(conn, pseudo_id: str):
    emp = conn.execute(
        "SELECT id, org_id FROM employees WHERE pseudo_id = ?", (pseudo_id,)
    ).fetchone()
    if emp is None:
        raise HTTPException(status_code=401, detail="unknown enrolment")
    return emp


@router.post("/v1/appeals", status_code=201)
async def create_appeal(body: AppealCreate) -> dict[str, str]:
    conn = get_conn()
    emp = _employee(conn, body.pseudo_id)

    appeal_id = uuid.uuid4().hex
    conn.execute(
        "INSERT INTO decision_appeals"
        " (id, org_id, employee_id, decision_type, category, employee_reason,"
        "  disclosed_text, prompt_hash, status, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
        (appeal_id, emp["org_id"], emp["id"], body.decision_type, body.category,
         body.reason, body.disclosed_text, body.prompt_hash, now_iso()),
    )
    conn.commit()
    return {"id": appeal_id, "status": "pending"}


@router.get("/v1/appeals/allowances")
async def list_allowances(pseudo_id: str) -> list[str]:
    """The prompt hashes the caller has an ACTIVE one-time pass for -- an appeal
    that was overturned, carries a prompt hash, and has not been used yet. The
    extension checks a blocked prompt's hash against this list."""
    conn = get_conn()
    emp = _employee(conn, pseudo_id)
    return [r["prompt_hash"] for r in conn.execute(
        "SELECT prompt_hash FROM decision_appeals"
        " WHERE employee_id = ? AND status = 'overturned'"
        "   AND prompt_hash IS NOT NULL AND pass_used = 0",
        (emp["id"],),
    )]


@router.post("/v1/appeals/allowances/consume")
async def consume_allowance(body: AllowanceConsume) -> dict[str, int]:
    """Burn the one-time pass for a prompt hash so it is never granted twice."""
    conn = get_conn()
    emp = _employee(conn, body.pseudo_id)
    cur = conn.execute(
        "UPDATE decision_appeals SET pass_used = 1"
        " WHERE employee_id = ? AND prompt_hash = ? AND status = 'overturned' AND pass_used = 0",
        (emp["id"], body.prompt_hash),
    )
    conn.commit()
    return {"consumed": cur.rowcount}


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
