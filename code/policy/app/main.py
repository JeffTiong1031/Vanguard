import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.deps import get_conn
from app.seed import seed_demo_org

# No APM, no body capture. Same posture as code/backend/app/main.py, and this
# module is where a reviewer looks to confirm it.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("vanguard.policy")

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
    conn = get_conn()
    row = conn.execute("SELECT id FROM orgs LIMIT 1").fetchone()
    if row:
        return row["id"]
    org_id = seed_demo_org(conn, name, password)
    log.info("seeded demo org id=%s", org_id)
    return org_id


from app.routes import enroll as _enroll  # noqa: E402  (import after `app` exists)
from app.routes import events as _events  # noqa: E402
from app.routes import policy as _policy  # noqa: E402

app.include_router(_enroll.router)
app.include_router(_events.router)
app.include_router(_policy.router)
