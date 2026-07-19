# `backend/` — ADR 0007

**STUB.** Python + FastAPI + Pydantic. **Pydantic → OpenAPI → generated TS client** (doc 01 §6).

## It is small, and saying so plainly is the point

Doc 06 §8: **"There is no interesting server-side scale problem in Phase 0, because I1 means there is
no prompt path to the server at all."**

The backend is **policy, dictionary, and hashed audit ingest.** Nothing else. Doc 02 §2.5 derives it
at **~$0.10–0.15/user/month**, falling with scale. *(The interesting scale problem is Phase 1's file
pipeline, which is doc 08's to size, and **U17 gates it.**)*

## Why Python, when TypeScript would have unified the types for free

Doc 01 §6 calls this **"the stack decision I'd defend hardest"**:

> It looks wrong on day one and is right by month four: the moment file parsing (Tika, unstructured,
> OCR) and cloud L3 arrive in Phase 1, a Node backend becomes a Node backend **plus** a Python service
> **plus** the glue between them. Three engineers cannot carry that. **Pay the codegen tax now; it's
> the cheaper of the two taxes and it's the one that doesn't compound.**

## Standing constraints

- 🔴 **Per-tenant DEKs from day one** (ADR 0009). *"Not an optimization — a global DEK makes staged
  crypto-shredding impossible and forces a flag-day migration."* **Cheap now, painful later.**
- 🔴 **I1 / I3: hashes, classes, counts. NEVER values.** There is no prompt path here and there must
  never be one. Doc 02 §8: the on-device budget is **"contractual, not preferential"** — every §6.4
  questionnaire answer *depends* on prompt text never leaving.
- 🔴 **Zero-retention is defended against our own future engineers** (doc 02 §4.3), not decided once.
  The named threats: **async retry** (needs the payload to still exist), **dead-letter queues**
  (*"literally a persistence mechanism for the content that failed"*), and **APM tools that capture
  request bodies by default and nobody notices for six months.** Each is individually reasonable and
  each **silently degrades "zero retention" to "short retention"** — a materially worse questionnaire
  answer, and one we would already have put in a contract.
- **`ap-southeast-5` for MY tenants from day one** (U13 ✅ GA 2024-08-22; **F3 corrected**). Residency
  is a **per-tenant config**, not a later upgrade — it deletes a Transfer Impact Assessment from every
  Malaysian deal rather than scheduling one. ⚠️ **U17** — per-service availability (ECS/Fargate, S3,
  KMS, RDS) is **unverified** and **must be checked before Phase 1 is sized.**
- **`chrome.storage.managed` is the Phase 1 tenant-key channel** (ADR 0009, U19 ✅). 🔴 **It is exposed
  to content scripts BY DEFAULT** — the key lands in **B2, not B3**, unless we call
  `setAccessLevel()`. *"Defaults are where the letter-vs-purpose trap lives, because a default is a
  decision nobody remembers making."*

## Running it (Slice 2 team test)

**Default — run it locally.** No shared/cloud API is required for the team test. Full walkthrough
(extension + API): [`../../README.md`](../../README.md) §Quick start.

### Preferred — uvicorn (Python 3.11+)

```bash
cd code/backend
python -m venv .venv

# Windows (PowerShell):  .\.venv\Scripts\Activate.ps1
# macOS / Linux:         source .venv/bin/activate

pip install -e ".[dev]"
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Optional — Docker

```bash
cd code/backend
docker compose up --build
```

### Verify

```bash
curl -s http://127.0.0.1:8000/healthz
curl -s -F "file=@tests/fixtures/zip_bomb.docx" http://127.0.0.1:8000/v1/extract
```

Expected: `{"ok":true}` then `{"error":{"code":"suspicious_archive",…}}`.

Point the extension **Options → File checking API URL** at `http://localhost:8000` (that is already
the default). Host permission for localhost is in `code/extension/wxt.config.ts`.

### Optional later — founder-hosted shared API

Only if several non-engineers cannot run Python/Docker. Stand up an HTTPS origin, put the URL in
Options, and extend `host_permissions` to match. Placeholder: `https://vanguard-extract.example.com`.
Until then, **do not block the team test on a shared instance.**

## What testers should know

**Local default:** file bytes go to `127.0.0.1` on **your** machine and are not kept after the
request. Prompt text never leaves the browser either way.

If you later use a **shared** instance, real work files leave the tester’s machine and are parsed on
a server the founder runs. That matches the commercial file posture (ADR 0008 — cloud parse,
in-region, zero-retention, under DPA), but the informal team is not a customer with a DPA — say so
up front.

**PDF redaction uses PyMuPDF** (`app/redact/pdf.py`). That is fine for pitch demos and Load unpacked
team tests. **Before Chrome Web Store submission or paying customers, resolve the licence** —
PyMuPDF is AGPL-3.0 or commercial; see the U30 spike notes in the Slice 2 plan.

## What this service does not keep

Doc 02 §4.3 names four ways zero-retention silently becomes short-retention. Each is closed here:

| Trap | How we close it |
|---|---|
| **Async retry** (needs the payload to still exist) | No retry queue, Celery, SQS, or similar — `test_zero_retention.py::test_the_app_declares_no_retry_or_queue_dependency` greps `app/main.py` for banned imports |
| **Dead-letter queue** (persistence for failed content) | Same structural guard — no DLQ dependency in the codebase |
| **Debug retention** ("easier with the file") | `app/routes/extract.py` docstring: *"Parse a file to text. Return the text. Keep nothing."* No upload volume mounts in `Dockerfile`; `docker-compose.yml` sets `restart: "no"` |
| **APM body capture** (nobody notices for six months) | `app/main.py` — no APM; `test_zero_retention.py::test_no_file_content_reaches_the_logs` and `test_a_parse_failure_does_not_log_the_body` |

**Framework default (F4):** Starlette's `UploadFile` spools files over 1 MB to disk. We read the raw
stream under a cap instead — `app/routes/extract.py` `/v1/extract`, guarded by
`test_no_temp_file_survives_a_request`. The container adds `read_only: true` and a 16 MB tmpfs so
even a slipped write has nowhere to land.

## Residency

**`ap-southeast-5`** is the commercial target for MY tenants (doc 02 §6.2, U13 ✅). The Slice 2 team
test runs on **localhost** or one **founder-hosted** instance and **does not exercise the residency
path**. U17 (per-service availability in that region) is still unverified and still gates Phase 1
sizing.

## Doc 07 §7.3 — read this before adding analytics

The class-level **Ignore rate** is a legitimate detector-prioritization signal, and it rides I3's
existing shape for free (class + count, never values). **Doc 00 §1.6's poisoning argument does not
reach it** — the poisoner is *indiscriminate*, so they move the mean without moving the ranking.

🔴 **But it is a SECOND PURPOSE for data collected under a compliance promise.** Doc 00 §4: the audit
trail is **the buyer's evidence** — *"a first-class feature, not telemetry. It's half of what they're
paying for."* Using it for our roadmap makes it telemetry **as well**.

**The DPA must name the analytics purpose before we use it. A paragraph now; a diligence finding
later.** Same shape as doc 07 §5.4: the data was always going to be fine — **the disclosure is the
work.**
