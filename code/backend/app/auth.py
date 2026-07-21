"""Opt-in shared-token gate for the Slice 2 demo host (Path A only).

When VANGUARD_DEMO_TOKEN is unset the gate is disabled and the file routes
behave exactly as before -- local docker compose and the test suite need no
token. /healthz is never gated: it is the wake/warm probe and carries no data.
"""

import hmac
import os

from fastapi import Request
from fastapi.responses import JSONResponse

ENV_VAR = "VANGUARD_DEMO_TOKEN"
_PREFIX = "Bearer "


def check_bearer(request: Request) -> JSONResponse | None:
    expected = os.environ.get(ENV_VAR) or None
    if expected is None:
        return None  # gate disabled

    header = request.headers.get("authorization", "")
    presented = header[len(_PREFIX):] if header.startswith(_PREFIX) else ""
    if presented and hmac.compare_digest(presented, expected):
        return None  # authorised

    return JSONResponse(
        status_code=401,
        content={
            "error": {
                "code": "unauthorized",
                "message": "This file was not checked and has not been sent to the AI.",
            }
        },
    )
