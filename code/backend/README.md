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
