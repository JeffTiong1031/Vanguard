# Hosted demo file-backend — design

> **Status:** approved design, ready for planning. **Written 2026-07-21.**
> **Scope:** Slice 2 file-checking backend only (`code/backend/`). Governance (`code/policy/`) is out.

---

## 1. Goal

Remove the one setup burden that stops the extension being usable straight from a clone: the
local file-checking server. Today a demo user must run `uvicorn`/`docker` on `localhost:8000`
before file attachments work. After this change:

> **Clone → Load unpacked → open ChatGPT/Claude → chat protection works → attach a file → file
> checking works. No terminal on the demo machine.**

Chat protection (Slice 1 prompt gate, L1+L2) and ethics (Plan C) already meet this bar — they run
on-device with no server. This work only closes the file-attachment gap.

## 2. Path A vs Path B — this is Path A only

- **This spec is Path A: a throwaway demo host.** A free-tier public HTTPS container running the
  existing `code/backend/` image. It is **not** residency-compliant and must never be presented as
  the production file path.
- **Ship (Path B) is unchanged and out of scope here:** files move to in-region Malaysia
  (`ap-southeast-5`), zero-retention, under DPA (locked decision #2). Nothing in this spec weakens
  that; the design keeps the API base **overridable** precisely so the ship host replaces the demo
  host by configuration, not by code change.

## 3. Non-goals

- Hosting `code/policy/` (Plan A/B governance). Separate future plan. Even hosted, its enrol +
  admin-approval flow is not "zero setup," so it does not belong in this push.
- Production residency, DPA, zero-retention infrastructure (that is Path B).
- Always-on uptime. Free-tier sleep is accepted (§7).
- True secrecy of the file API. The shared token (§6) is a casual-abuse deterrent, acknowledged as
  such.

## 4. Architecture

No new components and no change to the request/response contract. The only structural change is
**where the backend runs** and **that the client authenticates to it**.

```
Demo machine (no terminal)                         Render (free tier, public HTTPS)
┌───────────────────────────────┐                 ┌───────────────────────────────────┐
│ Chrome + unpacked extension    │                 │ code/backend Docker image          │
│                                │  POST /v1/extract│ FastAPI: /healthz                  │
│ on-device: Slice 1 gate, L1+L2 │ ───────────────▶│         /v1/extract  (parse→text)  │
│ ethics (Plan C)                │  POST /v1/redact │         /v1/redact   (mask→file)   │
│                                │ ◀───────────────│ Authorization: Bearer <demo token> │
│ file path → src/files/api.ts   │   JSON / file    │ CORS: chatgpt.com, claude.ai       │
└───────────────────────────────┘                 └───────────────────────────────────┘
```

**Data flow (unchanged from today except transport):** extension holds the attached file → uploads
bytes to `/v1/extract` → backend parses to text, keeps nothing (F4 / read-only container) → returns
extract + SHA-256 → **detection runs on-device** (ADR 0028) → if the user accepts masks, extension
re-uploads the original to `/v1/redact` with the accepted spans + `extract_sha256` → backend
re-parses, verifies the text matches what was reviewed, returns a format-preserving redacted file →
extension attaches the cleaned file → **the user presses Send** (decision #8).

## 5. The changes, precisely

### 5.1 Backend (`code/backend/`)

1. **Bearer-token gate on the file routes only.** `/v1/extract` and `/v1/redact` require
   `Authorization: Bearer <token>` matching env `VANGUARD_DEMO_TOKEN`; mismatch/absent → `401`.
   **`/healthz` stays open** (it is the wake/warm probe and carries no data).
   - Verify tokens with a constant-time compare (`hmac.compare_digest`), not `==`.
   - If `VANGUARD_DEMO_TOKEN` is **unset**, the gate is disabled (local `docker compose` and the
     test suite keep working unchanged). The gate is opt-in via the env var.
2. **CORS: add `authorization` to `allow_headers`.** `app/main.py` currently allows
   `content-type, x-vanguard-filename`; the browser's preflight for the new header will fail without
   it. `allow_origins` already lists `https://chatgpt.com` and `https://claude.ai` — no change there.
3. **Bind the Render-provided port.** Render sets `$PORT`. Change the Dockerfile `CMD` to honour it:
   `--port ${PORT:-8000}` (keeps `8000` for local compose). `EXPOSE` is cosmetic; the CMD is what
   matters.
4. **`render.yaml` blueprint at the repo root** (Render only reads it there), pointing at the
   subdirectory: `runtime: docker`, `rootDir: code/backend` (or `dockerfilePath: code/backend/Dockerfile`
   + `dockerContext: code/backend`), `plan: free`, `healthCheckPath: /healthz`, and
   `VANGUARD_DEMO_TOKEN` declared with `sync: false` (set in the dashboard, not committed). This is
   what makes the founder's deploy a no-terminal, connect-repo-in-dashboard action.

**Explicitly unchanged:** the parse path, `ProcessPoolExecutor` timeout guard, zip-bomb guards,
size limits, read-only filesystem posture. A real container runs them as-is (this is the reason we
chose a container PaaS over Vercel serverless — see §10).

### 5.2 Extension (`code/extension/`)

1. **Default API base → the Render URL.** `src/files/config.ts`: change `DEFAULT_BASE` from
   `http://localhost:8000` to the committed Render origin. `getApiBase()` still honours a
   `vg_api_base` storage override, so local dev and the future ship host need no code change.
2. **Send the bearer token on both file fetches.** `src/files/api.ts`: add
   `Authorization: Bearer <token>` to the `/v1/extract` and `/v1/redact` requests. The token is
   **pasted once in Options → File checking** and stored in `chrome.storage.local`
   (`vg_demo_token`) — **not** committed to the repo or baked into `dist/`. (Amended 2026-07-22:
   Path A originally used a committed constant; the repo is public, so that published the gate
   key. Options paste keeps the key off GitHub; teammates receive it out-of-band.)
3. **`host_permissions`: replace the placeholder.** `wxt.config.ts` already carries
   `https://vanguard-extract.example.com/*` with a "set this before the team test" note. Replace it
   with the real Render origin. **Keep** `http://localhost:8000/*` and `http://127.0.0.1:8000/*` for
   local dev. (`host_permissions` is baked at build time — the URL must be final before the build.)
4. **Rebuild + recommit `dist/`.** `npm run build` then `npm run check:dist` so the committed build
   matches source and a fresh clone loads the hosted URL with no toolchain; each tester still pastes
   the demo key in Options.

### 5.3 Where the token lives

One pre-shared team credential, in two places that must match:
- **Extension:** `vg_demo_token` in `chrome.storage.local`, set via Options (never in git).
- **Render:** `VANGUARD_DEMO_TOKEN` env var, set in the dashboard.

Told to testers out-of-band; they paste it once. Rotating it = update the Render env var and resend
the new value to the team (no rebuild required). **Not claimed as confidential against a motivated
attacker** — anyone with the key can call the free-tier host — but it is no longer world-readable
from a public GitHub clone.

## 6. Security posture (demo)

- **Threat:** a public, unauthenticated file-parser on the internet invites arbitrary uploads that
  burn the free tier and exercise the PDF/zip parsers. The bearer token raises the bar past casual
  discovery; existing size + zip-bomb + read-only + `mem_limit` guards bound the damage of anything
  that gets through.
- **Not claimed:** confidentiality of the token, DoS resistance, or any production security
  property. Private-repo MVP demo only.
- **No retention:** the container writes nothing on the request path (F4), and the image mounts no
  volume. A sleeping/redeployed free instance loses nothing because it stores nothing.

## 7. Error handling & cold start

- **Free-tier sleep (~15 min idle → ~50s first-request wake).** Accepted. Mitigation is procedural
  and documented in the demo brief: **hit the `/healthz` URL once to warm the server right before
  demoing.** No always-on cost, no pinger.
- **While asleep / unreachable:** the existing client already fails safe — `extractFile` throws
  `network` ("couldn't reach the file-checking service… not been sent to the AI"), and the file is
  **not** forwarded to the provider. Cold start therefore degrades to "attach again in a moment,"
  never to a silent leak. No new error states are introduced.
- **401 (token mismatch):** surfaces through the existing non-OK path as a check failure; the file
  is not sent. Only reachable if the committed token and Render env drift — a deploy checklist item,
  not a user-facing state.

## 8. Testing & acceptance

**Automated (must stay green):**
- `cd code/backend && pytest` — parsers, zip-bomb guard, redact, format-preserving. Add coverage:
  token-gate returns 401 without/with-wrong bearer, 200 with correct bearer, and `/healthz` open.
  Token gate disabled when `VANGUARD_DEMO_TOKEN` unset (existing tests keep passing untouched).
- `cd code/extension && npx vitest run` — including `check:dist` drift (rebuild dist after the wiring
  change or this fails, by design).

**Manual acceptance bar (the whole point):**
1. Fresh clone on a machine with **no Python and no Docker**.
2. `chrome://extensions` → Developer mode → Load unpacked → `code/extension/dist/chrome-mv3`.
3. Open `https://chatgpt.com` and `https://claude.ai`: prompt gate works (on-device, always did).
4. Warm the host once (`/healthz`), then attach a `.docx`/PDF containing an NRIC (`880101-14-5566`):
   review opens → accept the NRIC → Proceed → cleaned file attached → **user presses Send**.
5. **No terminal, no `uvicorn`, no Docker on the demo machine.**

Run the file rows of [`code/extension/ACCEPTANCE.md`](../../../code/extension/ACCEPTANCE.md) against
the hosted URL rather than localhost.

## 9. One-time deploy (founder, no terminal on the demo machine)

1. In the Render dashboard: **New → Blueprint**, connect the GitHub repo; Render reads `render.yaml`
   and builds the `code/backend/` Docker image.
2. Set `VANGUARD_DEMO_TOKEN` in the service's environment to the shared value.
3. Copy the resulting `https://<name>.onrender.com` URL.
4. Put that URL into `wxt.config.ts` (`host_permissions`) and `src/files/config.ts` (`DEFAULT_BASE`),
   set the matching token constant, `npm run build`, `npm run check:dist`, commit `dist/`.
5. From then on, everyone else: clone → Load unpacked → works.

(Steps 1–3 are dashboard clicks. Step 4 is a one-time build the founder/CTO runs once, not on any
demo machine. Hugging Face Spaces Docker is the no-credit-card fallback host if Render asks for a
card; same wiring, different origin.)

## 10. Why not Vercel (recorded so it is not re-litigated)

Vercel was the initial instinct ("quickest"). Rejected on three concrete facts about *this* backend:
1. **Vercel serverless is AWS Lambda** with historically no `/dev/shm`; the parse-timeout guard uses
   `ProcessPoolExecutor` (`app/safety.py`) which needs it — a **safety control** would break.
2. **4.5 MB request-body limit** collides with the 10 MB upload cap; files 4.5–10 MB would fail.
3. PyMuPDF is a fat native wheel to squeeze under the bundle limit, plus a FastAPI→serverless shim.

A container PaaS runs the **existing Dockerfile unchanged**, no body limit, guard intact, region
selectable (nudging the demo toward Path B, not away). This is a demo/eng convenience decision, not
an architecture reversal — it does not touch any locked decision or ADR.

## 11. Risks

| Risk | Severity | Handling |
|---|---|---|
| Cold-start ~50s stalls a live demo | Low | Warm `/healthz` before demoing (§7); documented in brief |
| Committed token ≠ Render env → 401s | Low | Deploy checklist (§9 step 4); 401 fails safe, never leaks |
| Free instance retired / URL changes | Low | URL is one constant + one `host_permissions` entry; rebuild dist |
| Someone reads demo host as "compliant" | Med | Labelled Path A throughout; §2 and the demo brief state it is not residency/DPA |
| `dist/` drift (committed build ≠ source) | Low | `check:dist` gate in CI/local; part of acceptance (§8) |
```

