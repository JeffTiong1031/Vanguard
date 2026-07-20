"""Admin API.

Authority is decided HERE, server-side, on every request. The console is a
view; it never adjudicates whether its user is an admin. A client-side admin
check is bypassed with devtools in under a minute and would ship a control
whose audit trail claims it worked -- doc 00 section 6's worst case.

Every route below except /login calls `_require_admin`, including /logout:
logout still needs to resolve an org_id to know which session row to delete,
and a blanket "every admin endpoint" rule is easier to hold to if there is no
carved-out exception to remember. Login is the one legitimate exception --
it is how a session is obtained in the first place, so it cannot itself
require one.

Policy-version bumps: `POST /tools/{llm_id}` and an *approved* decision on
`POST /requests/{request_id}` change what `org_llm_policy` holds, which is
exactly what `GET /v1/policy` serialises -- so both call
`bump_policy_version`. Minting and revoking enrolment tokens touch
`enroll_tokens`, a table `read_policy()` never reads, so a currently-enrolled
extension's view is unchanged either way -- no bump, and said so at each call
site rather than left to be inferred. A *denied* decision is reasoned through
at `decide_request` below, not assumed.
"""
import uuid

from fastapi import APIRouter, Body, Cookie, HTTPException, Response

from app.db import bump_policy_version
from app.deps import get_conn
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
    _require_admin(vg_admin)
    conn = get_conn()
    conn.execute("DELETE FROM admin_sessions WHERE token = ?", (vg_admin,))
    conn.commit()
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
    # Changes what GET /v1/policy serves for this org -- bump.
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
    # enroll_tokens is never read by read_policy() -- an already-enrolled
    # extension's policy view is unaffected. No bump.
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
    # Same reasoning as mint_token: enroll_tokens is outside read_policy()'s
    # reach, so a currently-enrolled extension sees no difference. No bump.
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
        "UPDATE access_requests SET status = ?, decided_at = ? WHERE id = ? AND org_id = ?",
        (decision, now_iso(), request_id, org_id),
    )
    if decision == "approved":
        conn.execute(
            "UPDATE org_llm_policy SET status = 'approved'"
            " WHERE org_id = ? AND llm_id = ?",
            (org_id, row["llm_id"]),
        )
    conn.commit()

    # A denial never touches org_llm_policy -- read_policy() serves the same
    # tools/categories body before and after, so the ETag it is keyed on must
    # not move. Only an approval changes org_llm_policy, so only an approval
    # bumps. (If a future change lets a denial affect anything read_policy()
    # serves -- e.g. a per-tool denial counter surfaced to the client -- this
    # exemption needs to be revisited alongside it.)
    version = bump_policy_version(conn, org_id) if decision == "approved" else conn.execute(
        "SELECT policy_version FROM orgs WHERE id = ?", (org_id,)
    ).fetchone()["policy_version"]
    return {"version": int(version)}


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
