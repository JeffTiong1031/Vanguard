# Hosted Demo File-Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a fresh clone load the unpacked extension and check file attachments with no terminal, by hosting `code/backend/` on a free public HTTPS container the extension calls with a shared bearer token.

**Architecture:** No new components and no change to the `/v1/extract` + `/v1/redact` request/response contract. The backend gains an opt-in bearer-token gate (env-driven) and a `$PORT`-aware start command; a `render.yaml` blueprint deploys the existing Dockerfile to Render's free tier. The extension defaults its API base to the hosted HTTPS URL and sends `Authorization: Bearer <token>` on the two file routes. Detection stays on-device (ADR 0028).

**Tech Stack:** FastAPI + Uvicorn (Python 3.11, existing Docker image), Render free tier, WXT + TypeScript extension, Vitest, pytest.

## Global Constraints

- **Path A demo only.** Never present this host as production/residency-compliant. Ship (Path B) stays Malaysia `ap-southeast-5` + DPA + zero-retention (locked decision #2). — spec §2.
- **`/healthz` stays open** (no token) — it is the wake/warm probe and carries no data. — spec §5.1.
- **Token gate is opt-in:** when env `VANGUARD_DEMO_TOKEN` is **unset**, the file routes behave exactly as today (local `docker compose` and the whole existing test suite must stay green). — spec §5.1.
- **Constant-time token compare** (`hmac.compare_digest`), never `==`. — spec §5.1.
- **Keep local-dev affordances:** `getApiBase()` storage override (`vg_api_base`) and the `http://localhost:8000/*` + `http://127.0.0.1:8000/*` host_permissions entries remain. — spec §5.2.
- **Committed `dist/` must match source:** `npm run check:dist` must pass before commit. — spec §8.
- **Commits:** no `Co-Authored-By` trailer (CLAUDE.md §6.1); author is already `JeffTiong1031`.
- **Deploy order (founder note):** code + tests land first with placeholder values; the founder deploys Render, gets the real URL, then Task 7 substitutes the real URL + token and rebuilds `dist/`. Hugging Face Spaces Docker is the fallback host only if Render requires a card.
- **The demo token is a casual-abuse deterrent, not a secret** — it is committed in the (private) repo build.

---

### Task 1: Backend bearer-token gate

**Files:**
- Create: `code/backend/app/auth.py`
- Modify: `code/backend/app/routes/extract.py` (imports; first lines of `extract` and `redact`)
- Test: `code/backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `fastapi.Request`, `fastapi.responses.JSONResponse`.
- Produces: `check_bearer(request: Request) -> JSONResponse | None` — returns a 401 `JSONResponse` when `VANGUARD_DEMO_TOKEN` is set and the request lacks a matching `Authorization: Bearer <token>`; returns `None` to allow the request (including whenever the env var is unset).

- [ ] **Step 1: Write the failing tests**

Create `code/backend/tests/test_auth.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _post_extract(**headers):
    return client.post(
        "/v1/extract",
        files={"file": ("a.txt", b"Ahmad 880101-14-5566", "text/plain")},
        headers=headers,
    )


def test_healthz_is_open_even_with_token_set(monkeypatch):
    monkeypatch.setenv("VANGUARD_DEMO_TOKEN", "s3cret")
    assert client.get("/healthz").status_code == 200


def test_extract_401_without_bearer(monkeypatch):
    monkeypatch.setenv("VANGUARD_DEMO_TOKEN", "s3cret")
    r = _post_extract()
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


def test_extract_401_with_wrong_bearer(monkeypatch):
    monkeypatch.setenv("VANGUARD_DEMO_TOKEN", "s3cret")
    r = _post_extract(authorization="Bearer nope")
    assert r.status_code == 401


def test_extract_200_with_correct_bearer(monkeypatch):
    monkeypatch.setenv("VANGUARD_DEMO_TOKEN", "s3cret")
    r = _post_extract(authorization="Bearer s3cret")
    assert r.status_code == 200


def test_gate_disabled_when_env_unset(monkeypatch):
    monkeypatch.delenv("VANGUARD_DEMO_TOKEN", raising=False)
    r = _post_extract()
    assert r.status_code == 200
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd code/backend && ".venv/Scripts/python.exe" -m pytest tests/test_auth.py -v`
Expected: FAIL — the four token tests do not yet return 401 (extract currently ignores auth), `ImportError` if you already reference `app.auth`.

- [ ] **Step 3: Create the auth module**

Create `code/backend/app/auth.py`:

```python
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
```

- [ ] **Step 4: Wire the gate into both file routes**

In `code/backend/app/routes/extract.py`, add to the imports block (after `from app import limits`):

```python
from app.auth import check_bearer
```

Add as the **first statement** inside `async def extract(request: Request)` (before `filename = ...`):

```python
    denied = check_bearer(request)
    if denied is not None:
        return denied
```

Add as the **first statement** inside `async def redact(request: Request)` (before the `try:` that reads multipart):

```python
    denied = check_bearer(request)
    if denied is not None:
        return denied
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd code/backend && ".venv/Scripts/python.exe" -m pytest tests/test_auth.py -v`
Expected: PASS (5 passed).

- [ ] **Step 6: Run the full backend suite to confirm no regression**

Run: `cd code/backend && ".venv/Scripts/python.exe" -m pytest -q`
Expected: PASS — previous 39 + 5 new = 44 passed (env unset in those tests, so the gate is disabled).

- [ ] **Step 7: Commit**

```bash
git add code/backend/app/auth.py code/backend/app/routes/extract.py code/backend/tests/test_auth.py
git commit -m "feat(backend): opt-in shared bearer-token gate on file routes"
```

---

### Task 2: CORS header + Render port binding

**Files:**
- Modify: `code/backend/app/main.py` (CORS `allow_headers`)
- Modify: `code/backend/Dockerfile` (`CMD`)
- Test: `code/backend/tests/test_auth.py` (add a CORS-preflight assertion)

**Interfaces:**
- Consumes: nothing new.
- Produces: the deployed container listens on `$PORT` (Render-provided) and the browser preflight for `authorization` succeeds.

- [ ] **Step 1: Write the failing test**

Append to `code/backend/tests/test_auth.py`:

```python
def test_cors_preflight_allows_authorization_header():
    r = client.options(
        "/v1/extract",
        headers={
            "Origin": "https://chatgpt.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert r.status_code == 200
    allowed = r.headers.get("access-control-allow-headers", "").lower()
    assert "authorization" in allowed
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd code/backend && ".venv/Scripts/python.exe" -m pytest tests/test_auth.py::test_cors_preflight_allows_authorization_header -v`
Expected: FAIL — `authorization` not in the allowed headers (current list is `content-type, x-vanguard-filename`).

- [ ] **Step 3: Add `authorization` to CORS allow_headers**

In `code/backend/app/main.py`, change the `allow_headers` line inside `add_middleware(CORSMiddleware, ...)`:

```python
    allow_headers=["content-type", "x-vanguard-filename", "authorization"],
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd code/backend && ".venv/Scripts/python.exe" -m pytest tests/test_auth.py::test_cors_preflight_allows_authorization_header -v`
Expected: PASS.

- [ ] **Step 5: Make the Dockerfile honour Render's `$PORT`**

In `code/backend/Dockerfile`, replace the final `CMD` line (JSON-array exec form cannot expand env vars) with a shell form that defaults to 8000 for local compose:

```dockerfile
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-access-log"]
```

- [ ] **Step 6: Verify the image still builds and serves locally (optional but recommended)**

Run: `cd code/backend && docker build -t vanguard-extract . && docker run --rm -p 8000:8000 vanguard-extract &`
Then: `curl -s http://127.0.0.1:8000/healthz` → Expected: `{"ok":true}`. Stop the container afterwards.
(If Docker is unavailable on this machine, skip — Render builds the same Dockerfile; the CMD change is verified by inspection.)

- [ ] **Step 7: Commit**

```bash
git add code/backend/app/main.py code/backend/Dockerfile code/backend/tests/test_auth.py
git commit -m "feat(backend): allow Authorization in CORS; bind \$PORT for Render"
```

---

### Task 3: Render blueprint

**Files:**
- Create: `render.yaml` (repo root — Render only reads it there)

**Interfaces:**
- Consumes: `code/backend/Dockerfile` (via `rootDir`).
- Produces: a one-click Blueprint deploy that builds the backend image on Render's free plan, health-checks `/healthz`, and exposes `VANGUARD_DEMO_TOKEN` as a dashboard-set env var.

- [ ] **Step 1: Create the blueprint**

Create `render.yaml` at the repo root:

```yaml
# Path A demo host for the Slice 2 file-checking backend.
# Deploy: Render dashboard -> New -> Blueprint -> connect this repo.
# NOT production: production file path is Malaysia + DPA + zero-retention (Path B).
services:
  - type: web
    name: vanguard-extract
    runtime: docker
    rootDir: code/backend
    dockerfilePath: ./Dockerfile
    plan: free
    healthCheckPath: /healthz
    envVars:
      - key: VANGUARD_DEMO_TOKEN
        sync: false   # set in the Render dashboard; never committed
```

- [ ] **Step 2: Validate it is well-formed YAML**

Run: `cd "C:/Jeff/UM AI/Y1 Sem break/HackAttack" && python -c "import yaml,sys; yaml.safe_load(open('render.yaml')); print('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add render.yaml
git commit -m "chore: Render blueprint for Slice 2 demo file-backend"
```

---

### Task 4: Extension sends the bearer token

**Files:**
- Modify: `code/extension/src/files/config.ts` (add `DEMO_TOKEN`; change `DEFAULT_BASE`)
- Modify: `code/extension/src/files/api.ts` (send `Authorization` on `/v1/extract` and `/v1/redact`)
- Test: `code/extension/tests/files/api.test.ts` (add header assertions)

**Interfaces:**
- Consumes: `getApiBase()` (unchanged).
- Produces: `DEMO_TOKEN: string` exported from `config.ts`; both file requests carry `Authorization: Bearer ${DEMO_TOKEN}`. `DEFAULT_BASE` points at the hosted HTTPS origin (placeholder until Task 7).

- [ ] **Step 1: Write the failing tests**

Append to `code/extension/tests/files/api.test.ts` (inside the file, after the existing `describe('extractFile', ...)` block — reuse the file's existing `mockFetch`, `okBody`, and imports):

```ts
describe('demo bearer token', () => {
  it('sends Authorization: Bearer on extract', async () => {
    const spy = mockFetch(200, okBody);
    vi.stubGlobal('fetch', spy);
    await extractFile(new File(['x'], 'a.txt'));
    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer .+/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd code/extension && npx vitest run tests/files/api.test.ts`
Expected: FAIL — `headers.Authorization` is `undefined` (extract currently sends only `x-vanguard-filename`).

- [ ] **Step 3: Add the token constant and hosted default in `config.ts`**

In `code/extension/src/files/config.ts`, change the `DEFAULT_BASE` line:

```ts
// Path A demo host (Render). Local dev: set `vg_api_base` in Options to http://localhost:8000.
// Replaced with the real onrender.com URL at deploy time (Task 7).
const DEFAULT_BASE = 'https://vanguard-extract.onrender.com';
```

And add, near the top of the file (after the `CLIENT_LIMITS` block):

```ts
/**
 * Shared demo bearer token, baked into the team-test build. Path A only, NOT a
 * secret (it ships in the private repo build) -- a casual-abuse deterrent for the
 * public host. Must equal VANGUARD_DEMO_TOKEN in the Render environment.
 * See docs/superpowers/specs/2026-07-21-hosted-demo-file-backend-design.md.
 * Replaced with the real value at deploy time (Task 7).
 */
export const DEMO_TOKEN = 'REPLACE_WITH_DEMO_TOKEN';
```

- [ ] **Step 4: Send the header on both requests in `api.ts`**

In `code/extension/src/files/api.ts`, change the import line:

```ts
import { CLIENT_LIMITS, DEMO_TOKEN, getApiBase } from './config';
```

In `extractFile`, change the `fetch` `headers` object:

```ts
      headers: {
        'x-vanguard-filename': encodeURIComponent(file.name),
        Authorization: `Bearer ${DEMO_TOKEN}`,
      },
```

In `redactFile`, add a `headers` field to the `/v1/redact` fetch (it currently has none):

```ts
    response = await fetch(`${base}/v1/redact`, {
      method: 'POST',
      body,
      signal: abort.signal,
      headers: { Authorization: `Bearer ${DEMO_TOKEN}` },
    });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd code/extension && npx vitest run tests/files/api.test.ts`
Expected: PASS (existing api tests + the new bearer test).

- [ ] **Step 6: Commit**

```bash
git add code/extension/src/files/config.ts code/extension/src/files/api.ts code/extension/tests/files/api.test.ts
git commit -m "feat(ext): send shared demo bearer token on file routes; default to hosted API"
```

---

### Task 5: Point host_permissions at the hosted origin + rebuild dist

**Files:**
- Modify: `code/extension/wxt.config.ts` (replace the placeholder file-extract origin)
- Modify: `code/extension/dist/**` (regenerated by the build)

**Interfaces:**
- Consumes: the source changes from Task 4.
- Produces: a committed `dist/chrome-mv3` that loads unpacked and is permitted to call the hosted HTTPS origin. (This is a placeholder-URL build; Task 7 produces the demo-final build after the real URL is known.)

- [ ] **Step 1: Swap the placeholder origin**

In `code/extension/wxt.config.ts`, replace the line:

```ts
      'https://vanguard-extract.example.com/*',
```

with (keep the surrounding comment; keep the `localhost` and `127.0.0.1` entries above it unchanged):

```ts
      'https://vanguard-extract.onrender.com/*',
```

- [ ] **Step 2: Rebuild the committed dist**

Run: `cd code/extension && npm run build`
Expected: build succeeds; `dist/chrome-mv3/manifest.json` now lists `https://vanguard-extract.onrender.com/*` in `host_permissions`.

- [ ] **Step 3: Verify dist matches source**

Run: `cd code/extension && npm run check:dist`
Expected: PASS (no drift).

- [ ] **Step 4: Confirm the manifest carries the hosted origin**

Run: `grep -c "vanguard-extract.onrender.com" code/extension/dist/chrome-mv3/manifest.json`
Expected: `1`.

- [ ] **Step 5: Run the full extension suite**

Run: `cd code/extension && npx vitest run`
Expected: PASS across the suite (the pre-existing `dist-drift` "fresh build" test is now satisfied because dist was just rebuilt).

- [ ] **Step 6: Commit**

```bash
git add code/extension/wxt.config.ts code/extension/dist
git commit -m "feat(ext): permit hosted file-extract origin; rebuild dist"
```

---

### Task 6: Docs — demo brief, warm-before-demo, deploy order

**Files:**
- Modify: `README.md` (add a "Hosted demo backend (no terminal)" subsection under the team-test quick start)
- Modify: `code/extension/ACCEPTANCE.md` (Slice 2 prerequisites note the hosted-URL option)

**Interfaces:**
- Consumes: nothing.
- Produces: instructions a tester/founder follows — the token brief, the `/healthz` warm step, and the deploy order.

- [ ] **Step 1: Add the hosted-backend subsection to `README.md`**

In `README.md`, immediately after the `### 2. Start the file-checking API (needed for Slice 2 / attachments)` section of the **team test** quick start, insert:

```markdown
#### Option: hosted demo backend (no terminal)

For demos where nobody should run Python/Docker, the file-checking API is hosted
on Render (Path A demo host — **not** the production/residency path). The committed
extension build already points at it, so testers just **clone → Load unpacked → use it**.

- **Testers:** you do not paste anything. The demo bearer token is baked into the build.
  Before a live demo, open `https://vanguard-extract.onrender.com/healthz` once to **wake
  the server** (free tier sleeps after ~15 min idle; first hit can take ~50s). It should show
  `{"ok":true}`.
- **If a file says "couldn't reach the file-checking service":** the host was asleep or is
  waking — wait a few seconds and attach again. The file is never sent to the AI unchecked.
- **Founder (one-time deploy):** Render dashboard → New → Blueprint → connect this repo
  (reads `render.yaml`); set `VANGUARD_DEMO_TOKEN` in the service env; then wire the real URL
  + token into the build (see the plan's Task 7). No terminal on any demo machine.

> This host is demo scaffolding only. It is not in-region, has no DPA, and is not the
> compliance story. Production (Path B) keeps files in Malaysia (`ap-southeast-5`),
> zero-retention, under DPA.
```

- [ ] **Step 2: Note the hosted option in `ACCEPTANCE.md`**

In `code/extension/ACCEPTANCE.md`, in the Slice 2 **Prerequisites** line (currently pointing at local `uvicorn`/compose + Options URL), add a sentence:

```markdown
Alternatively, use the hosted demo backend (Path A): the committed build points at it and the demo token is baked in — no local API needed. Warm `https://vanguard-extract.onrender.com/healthz` before the session (free tier sleeps).
```

- [ ] **Step 3: Verify the docs render / links resolve (visual check)**

Run: `grep -n "onrender.com/healthz" README.md code/extension/ACCEPTANCE.md`
Expected: matches in both files.

- [ ] **Step 4: Commit**

```bash
git add README.md code/extension/ACCEPTANCE.md
git commit -m "docs: hosted demo backend — warm-before-demo, token brief, deploy order"
```

---

### Task 7: Deploy to Render and wire the real URL + token (founder, one-time)

> **This task is run once by the founder after the code tasks land. It has no failing test — its deliverable is a working hosted demo, verified by the manual acceptance run. Steps 1–3 are dashboard clicks (no terminal); steps 4–7 are a one-time build on the founder's/CTO's machine, not on any demo machine.**

**Files:**
- Modify: `code/extension/src/files/config.ts` (`DEFAULT_BASE` + `DEMO_TOKEN` → real values)
- Modify: `code/extension/wxt.config.ts` (real onrender subdomain, if different from the placeholder)
- Modify: `code/extension/dist/**` (rebuilt)

- [ ] **Step 1: Deploy the blueprint**

In the Render dashboard: **New → Blueprint**, connect the GitHub repo. Render reads `render.yaml` and builds the `code/backend/` image. (If Render requires a credit card and you'd rather not add one, deploy the same Dockerfile as a Hugging Face **Docker Space** instead; the wiring below is identical, only the origin differs.)

- [ ] **Step 2: Set the demo token in the service environment**

In the service's **Environment**, set `VANGUARD_DEMO_TOKEN` to a chosen shared value (e.g. a 32-char random string). Save; let it redeploy.

- [ ] **Step 3: Copy the service URL and confirm health**

Copy `https://<name>.onrender.com`. Open `https://<name>.onrender.com/healthz` in a browser.
Expected: `{"ok":true}` (first hit may take ~50s to wake).

- [ ] **Step 4: Substitute the real values in source**

- In `code/extension/src/files/config.ts`: set `DEFAULT_BASE` to the real `https://<name>.onrender.com` and `DEMO_TOKEN` to the exact value set in Step 2.
- In `code/extension/wxt.config.ts`: if the subdomain differs from `vanguard-extract`, update the `https://<name>.onrender.com/*` host_permissions entry to match.

- [ ] **Step 5: Rebuild and verify no drift**

Run: `cd code/extension && npm run build && npm run check:dist`
Expected: build succeeds; `check:dist` PASS.

- [ ] **Step 6: Manual acceptance on a clean machine (the whole point)**

On a machine with **no Python and no Docker**:
1. Fresh clone; `chrome://extensions` → Developer mode → Load unpacked → `code/extension/dist/chrome-mv3`.
2. Open `https://chatgpt.com` and `https://claude.ai`: type a prompt with an NRIC → the prompt gate opens (on-device).
3. Warm `https://<name>.onrender.com/healthz`, then attach a `.docx`/PDF containing `880101-14-5566`: review opens on the File tab → Accept the NRIC → Proceed → cleaned file attached → **press Send yourself**.
4. Confirm: no terminal, no `uvicorn`, no Docker on this machine.

Run the file rows of `code/extension/ACCEPTANCE.md` against the hosted URL and record results.

- [ ] **Step 7: Commit the demo-final build**

```bash
git add code/extension/src/files/config.ts code/extension/wxt.config.ts code/extension/dist
git commit -m "chore(ext): wire live Render URL + demo token; demo-final dist"
```

---

## Self-Review

**Spec coverage** (spec → task):
- §5.1 backend token gate → Task 1 ✅ · CORS `authorization` + `$PORT` → Task 2 ✅ · `render.yaml` → Task 3 ✅
- §5.2 extension default base + bearer on both routes → Task 4 ✅ · host_permissions swap + rebuild dist → Task 5 ✅
- §5.3 token in two matching places (config constant + Render env) → Task 4 (constant) + Task 7 Step 2/4 ✅
- §6 security posture (token gate, existing guards untouched) → Task 1 (gate); parse/zip/size guards deliberately unchanged ✅
- §7 cold start + fail-safe network path → Task 6 docs (warm-before-demo); existing `network` error path unchanged (no code needed) ✅
- §8 automated gates + manual acceptance → Task 1/2 pytest, Task 4/5 vitest+check:dist, Task 7 Step 6 manual ✅
- §9 one-time deploy runbook, deploy-first order → Task 7 ✅
- §2/§11 "not compliant" labelling → Task 3 comment + Task 6 README note ✅

**Placeholder scan:** `REPLACE_WITH_DEMO_TOKEN` and `vanguard-extract.onrender.com` are intentional, explicitly substituted in Task 7 — not plan placeholders. No "TBD"/"add error handling"/"write tests for the above" left. Every code step shows the code.

**Type consistency:** `check_bearer(request) -> JSONResponse | None` defined in Task 1, called identically in both routes. `DEMO_TOKEN` exported from `config.ts` (Task 4) and imported in `api.ts` (Task 4) and edited in Task 7 — same name throughout. `VANGUARD_DEMO_TOKEN` env var name identical in `auth.py`, `render.yaml`, README, and Task 7. Error code string `"unauthorized"` consistent between `auth.py` and the Task 1 test.
```

