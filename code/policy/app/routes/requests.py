import uuid

from fastapi import APIRouter, HTTPException

from app.deps import get_conn
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
