# Vanguard

Pre-seed **prompt-privacy** design package and Chrome extension (Manifest V3).

Stops employees leaking sensitive data into third-party LLM chat UIs (ChatGPT, Claude) via typing-time L1 hints, a send-time gate (L1 + on-device L2 NER), and context-preserving pseudonymization. **The user always presses Send** — no auto-submit. Raw **prompts** never leave the device for scanning.

**Slice 2** adds file-content checking: the extension intercepts attaches, a small local API parses the file to text, detection still runs **on-device**, then (if needed) the API returns a format-preserving redacted file. See [ADR 0028](docs/adr/0028-backend-parses-extension-detects.md).

This repo is primarily **documents + a working team-test extension**, not a shipping product. Buyer = enterprise compliance officer ([ADR 0001](docs/adr/0001-buyer-is-the-compliance-officer.md)).

> **Testing the AI governance platform** (policy service + tool approval workflow + on-device ethics classifier — Plans A/B/C on the `ethics-classifier` branch)? Its setup and test cases are in [`code/extension/README.md`](code/extension/README.md#ai-governance-platform-plans-a--b--c--setup--testing). The quick start below is the `main`-branch Slice 1/2 file-checking team test.

---

## Quick start — team test (Slice 1 + Slice 2)

Use **`main`**. No shared/cloud API is required for the team test — each person runs the backend locally.

### 1. Clone

```bash
git clone https://github.com/JeffTiong1031/Vanguard.git
cd Vanguard
git checkout main
git pull
```

### 2. Start the file-checking API (needed for Slice 2 / attachments)

Requires **Python 3.11+**. From the repo root:

```bash
cd code/backend
python -m venv .venv

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1

# macOS / Linux
# source .venv/bin/activate

pip install -e ".[dev]"
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Leave that terminal open. Check it is up:

```bash
curl -s http://127.0.0.1:8000/healthz
```

Expected: `{"ok":true}`.

**Optional — Docker** (if you have Docker Desktop):

```bash
cd code/backend
docker compose up --build
```

Same URL: `http://127.0.0.1:8000`.

### 3. Load the extension (no toolchain required)

`dist/` is committed — you do **not** need `npm install` to try it.

1. Chrome → `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select:

```text
code/extension/dist/chrome-mv3
```

4. Open the extension **Options** page. **File checking API URL** should be `http://localhost:8000` (the default). Only change it if your API is elsewhere.
5. Open [chatgpt.com](https://chatgpt.com) or [claude.ai](https://claude.ai).

**Chat-only (Slice 1):** works without the backend.  
**Attachments (Slice 2):** backend must be running, or the extension will report that the file-checking service is unreachable.

First on-device L2 scan may download model weights from a public CDN (hash-verified) — can take a minute on a cold cache.

### 4. What to try

Follow [`code/extension/ACCEPTANCE.md`](code/extension/ACCEPTANCE.md) (Slice 1 prompt path + Slice 2 file rows).

---

## Developers (rebuild the extension)

Only needed if you change extension source:

```bash
cd code/extension
npm install
npm test
npm run build          # refreshes dist/ + drift stamp
npm run check:dist     # fails if committed dist ≠ source
```

Reload the unpacked extension in `chrome://extensions` after a rebuild.

Backend tests:

```bash
cd code/backend
# with venv activated
pytest
```

---

## What you get

| Surface | Behavior |
|---------|----------|
| **While typing** | L1-only rose underlines (NRIC, email, TIN, card, …) — advisory, never blocks Send ([ADR 0024](docs/adr/0024-slice-1-5-l1-composer-hints.md)) |
| **On Send (prompt)** | Hard gate: Review before send — per-span Accept / Ignore-with-reason, then **you** press Send ([ADR 0025](docs/adr/0025-send-time-per-span-review.md)) |
| **On attach (file)** | File held; extract via local API; L1+L2 on-device; review → optional redact → attach cleaned / proceed ([ADR 0027](docs/adr/0027-cleaned-extract-replaces-attachment.md) · [ADR 0028](docs/adr/0028-backend-parses-extension-detects.md)) |
| **Engine down** | Degrades to advisory — never fail-closed ([ADR 0014](docs/adr/0014-degrade-to-advisory-never-closed.md)) |

Not yet: sensitive-vs-not classifier (parallel `ml/` track), rehydration of originals into the page (killed — E2), force-install / B3, XLSX.

**Privacy one-liner:** prompt text is scanned **on-device**. File **bytes** go to the local API for parse/redact only (zero-retention design); detection still runs on the device. We claim sensitive values **do not reach the provider’s servers / training set** after a rewrite — not that the provider’s page JS never sees the composer.

---

## Repo map

| Path | Role |
|------|------|
| [`ASSUMPTIONS.md`](ASSUMPTIONS.md) | Locked decisions + unverified claims register |
| [`docs/00`–`07`](docs/) | Critique → HLD → privacy → ML → LLD → perf → training |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records |
| [`CLAUDE.md`](CLAUDE.md) | Session briefing for agents / CTO context |
| [`code/extension/`](code/extension/) | Extension (WXT, committed `dist/`) |
| [`code/backend/`](code/backend/) | File extract/redact API (`/v1/extract`, `/v1/redact`) |
| [`code/spikes/`](code/spikes/) | Measurement harnesses (evidence, not product) |
| [`docs/team/`](docs/team/) | Briefs for parallel tracks (e.g. sensitive-vs-not) |

More detail: [`code/README.md`](code/README.md) · [`code/backend/README.md`](code/backend/README.md) · [`code/extension/README.md`](code/extension/README.md).

---

## Sequencing (do not reorder casually)

See [ADR 0016](docs/adr/0016-mvp-first-sequencing.md):

1. **Slice 1** chat text → team acceptance  
2. **Slice 2** file **content** checking  
3. Integrate sensitive-vs-not from the parallel ML track  
4. **Doc 08** roadmap/risks — only after both slices  

B3 (force-install interviews), U6-b threshold, and marketing stay **parked** until both slices land.

---

## License / status

Private pre-seed work. Not an open-source release. Contact the founder for team-test access.
