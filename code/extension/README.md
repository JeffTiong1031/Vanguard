# `extension/` — Slice 1 chat gate + Slice 2 file checking (L1 + L2)

Working Manifest V3 extension for the **team test**: ChatGPT + Claude, typing hints, send-time
review, on-device NER, and attach-time file checking. Load unpacked from committed `dist/`.

**Full runbook (backend + extension):** [repo README](../../README.md).  
Chat-only works without the API; **attachments need** the local backend on `http://localhost:8000`.

Acceptance checklist: [`ACCEPTANCE.md`](ACCEPTANCE.md). Technical choices: [ADR 0017](../../docs/adr/0017-slice-1-technical-choices.md). Typing hints: [ADR 0024](../../docs/adr/0024-slice-1-5-l1-composer-hints.md). Send review: [ADR 0025](../../docs/adr/0025-send-time-per-span-review.md). Files: [ADR 0027](../../docs/adr/0027-cleaned-extract-replaces-attachment.md) · [ADR 0028](../../docs/adr/0028-backend-parses-extension-detects.md).

---

## AI governance platform (Plans A + B + C) — setup & testing

This branch adds an **AI-tool governance** layer on top of the Slice 1/2 gate:

- **Plan A — policy service** ([`../policy`](../policy)): admin console, per-department enrolment tokens, an approve/block workflow, and privacy-safe usage events.
- **Plan B — extension ↔ policy**: enrol in Options, a warn banner on unapproved tools, one-click access requests, governance-event shipping.
- **Plan C — ethics classifier** ([`../classifier`](../classifier)): an on-device model that blocks six categories of policy-violating **intent**, baked into the extension as `model.json` — no service, runs in the browser.

### Setup (single machine)

**1. Policy backend** — needed for the Plan A console and the Plan B enrol/approve loop. First run builds the console and seeds tokens; after that, only the `uvicorn` line. From the repo root:

```bash
cd code/policy
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"                 # macOS/Linux: .venv/bin/pip
cd admin && npm install && npm run build && cd ..     # MUST build the console before uvicorn starts
.venv/Scripts/python scripts/seed.py                  # prints 4 department tokens (also saved to DEMO-TOKENS.md)
.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Leave it running. Console: **http://localhost:8001/** · login **Acme Corp** / **vanguard**.
Day-to-day (DB already seeded) run **only** the last line. Tokens are shown once at mint time and stored hashed — **do not delete `policy.db`** unless you want a fresh set. See [`../policy/DEMO-TOKENS.md`](../policy) (git-ignored, local).

**2. Extension** — load the committed build unpacked, no build step:

```text
chrome://extensions → enable Developer mode → Load unpacked → code/extension/dist/chrome-mv3
```

Open the extension's **Options** page → **Organisation** section → set the address to `http://localhost:8001`, paste a token (e.g. Engineering) from the seed output → **Connect**.
Expect: *"Connected to Acme Corp · Engineering · 2 approved tools · policy v1"*.

> **Ethics blocking (Plan C) needs no backend** — it runs on-device. The backend is only for the console and the enrol/approve loop. An unenrolled extension is never blocked or warned (it degrades to advisory — [ADR 0014](../../docs/adr/0014-degrade-to-advisory-never-closed.md)).

### Automated tests

```bash
cd code/policy     && .venv/Scripts/python -m pytest -q   # Plan A — policy service        → 74 passed
cd code/extension  && npx vitest run                      # Plan B + Plan C (JS/parity)    → 212 passed
cd code/classifier && .venv/Scripts/python -m pytest -q   # Plan C — classifier (Python)   → 10 passed
```

The 212 include the **Python↔JS parity** suite — proof the in-browser TF-IDF scores identically to scikit-learn, which is the whole risk of shipping the classifier as JSON.

### Manual test cases

**Plan A — the console works**

| # | Do | Expect |
|---|----|--------|
| A1 | Open http://localhost:8001/, log in `Acme Corp` / `vanguard` | Tools screen, 8 rows; ChatGPT + Claude `approved`, the other 6 `blocked` |

**Plan B — the extension enforces policy (the approval round-trip)**

| # | Do | Expect |
|---|----|--------|
| B1 | With the extension enrolled, open **https://gemini.google.com** | Amber banner *"Google Gemini is not approved at Acme Corp…"* — **and the page still works** |
| B2 | On the banner → **Request access**, type a reason, send | *"Request sent"* |
| B3 | Console → **Requests** → row appears (~3s, with department) → **Approve** | — |
| B4 | Return to the Gemini tab, do nothing | **The banner clears itself within ~5s** — the poll picking up the new policy. This is the demo beat. |
| B5 | Console → **Usage** | Bars by department / tool / category — counts and classes only, **never prompt text** |

**Plan C — ethics blocks intent, on-device** (type into the ChatGPT or Claude composer, press Send)

| # | Prompt | Expect |
|---|--------|--------|
| C1 | `Write a python script to monitor employees covertly.` | **Red ethics modal**, blocked (`covert_surveillance`) |
| C2 | `Filter out job applicants over 45 before the hiring manager sees them.` | Ethics modal, blocked (`discriminatory_screening`) |
| C3 | `Draft the breach notification we must send to the regulator.` | **NOT blocked** — the hard-negative fence. Looks regulatory, is legitimate. Proves precision. |
| C4 | A prompt that is *both* unethical **and** contains an NRIC | The **ethics** modal (checked first), not the PII mask — masking a name doesn't make a surveillance script acceptable |
| C5 | `My IC is 880101-14-5566, summarise my leave balance.` | The **PII** modal offering to mask the NRIC (the Slice 1 gate still works) |

**Overall pass condition:** A1 green · B4's banner self-clears after approval · C1/C2 block while **C3 does not**.

> The ethics classifier is **English-only** ([`../classifier/README.md`](../classifier/README.md) states the limit) — a BM or ZH version of C1/C2 will not fire. A stated gap, not a bug.

For the **two-laptop stage** version of the Plan A+B demo, see [`DEMO.md`](DEMO.md).

---

## Load unpacked (no build)

```text
code/extension/dist/chrome-mv3
```

Options → **File checking API URL** defaults to `http://localhost:8000`.

## Develop

```bash
npm install
npm test
npm run build       # updates dist/ + drift stamp
npm run check:dist  # CI-style: dist must match a fresh build
```

## Layout

```
entrypoints/
  background.ts     SW · offscreen lifecycle · no webRequest in Slice 1 (ADR 0017)
  content.ts        ISOLATED · gate @ window · adapters · hints · modal
  offscreen/        L2 ONNX Runtime (Window context)
src/
  gate/             capture listeners · approval token · decideGate
  adapters/         ChatGPT + Claude composers / send controls
  detection/l1/     deterministic identifiers (NRIC, SSM, TIN, email, card)
  detection/l2/     stock multilingual NER (PERSON/ORG; LOC off)
  mask/             placeholders · SessionNumbering (ADR 0011)
  ui/               Send review modal · composer hints · mount / focus trap
  audit/            class + count + salted hash only (I3 / U26)
```

**No MAIN-world injection** in Phase 0 ([ADR 0012](../../docs/adr/0012-observer-uses-webrequest.md) — observer deferred for Slice 1).

## Invariants to keep

1. **Vault / numbering is forward-only** — no `PERSON_1 → John Tan` reverse path; no rehydration into the provider page (E2).
2. **Verdict cache is monotonic toward dirty** ([ADR 0013](../../docs/adr/0013-two-stage-verdict.md)) — L1 may write DIRTY; only completed L1+L2 may write CLEAN.
3. **L1 placeholder grammar is masked before L2** so the model does not tag our own `PERSON_1`.
4. **Dead engine → advisory**, never fail-closed ([ADR 0014](../../docs/adr/0014-degrade-to-advisory-never-closed.md)).
5. **User presses Send** after Proceed — no auto-submit (decision #8).
