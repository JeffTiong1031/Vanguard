# ADR 0028 — The backend parses; the extension detects

**Status:** Accepted · **Date:** 2026-07-18 · **Decider:** the founder (CTO recommendation accepted)
**Related:** [ADR 0007](0007-python-backend.md) · [ADR 0008](0008-hybrid-split-by-workload.md) ·
[ADR 0018](0018-sensitive-vs-not-parallel-track.md) · doc 06 §1 · doc 02 §4.3 · F4

## Context

Slice 2 needs file bytes converted to text the existing L1 + stock-NER stack can scan. The brief's
first shape was `POST /scan → { extract, findings }` with detection in Python. **Pushback 2 in the
Slice 2 plan argued against that shape before implementation.** This ADR records the accepted split:
**`/v1/extract` returns plain text + coverage + an offset map; the extension runs the same detectors
as the prompt path.**

## Options

| | Option | Verdict |
|---|---|---|
| **A** | Backend parses **and** detects — one `/scan` response with findings | ❌ **Rejected.** Creates a second L1 source of truth; opens a second integration seam for post-Slice-2 sensitive-vs-not; misreads ADR 0008's actual argument (see below). |
| **B** | **Backend parses only; extension detects on-device** | ✅ **Chosen.** `POST /v1/extract` + optional `POST /v1/redact` for format-preserving masks ([ADR 0027](0027-cleaned-extract-replaces-attachment.md)). |

## Decision — B

### Four reasons (in descending order)

1. 🔴 **Otherwise L1 exists twice.** The NRIC / SSM / `NRIC_OR_SSM_AMBIGUOUS` / TIN / email / Luhn
   grammars are ~200 lines of TypeScript in `code/extension/src/detection/l1/` with a test suite. A
   Python copy is a **second source of truth for the package's most precision-critical layer**, and
   it will drift. CLAUDE.md §2's ledger is eleven entries of one truth recorded in two places and
   only one of them being corrected. **Do not create a twelfth on purpose, in the layer whose
   precision ADR 0001 calls quasi-contractual.**

2. **ADR 0018 §Consequences requires a narrow seam:** *"the integration seam is a single interface:
   the extension calls a detector that returns spans + labels; today it is stock NER, later it is the
   trained model. Keeping that seam narrow in Slice 1 is now a design requirement."* A backend
   detector opens a **second** seam that the post-Slice-2 sensitive-vs-not integration would then
   have to replace twice.

3. **It matches ADR 0008's actual argument rather than its summary.** Re-reading *"Why not A"*
   (on-device files): on-device file processing was rejected for the **hostile-format parser attack
   surface** (*"zip bombs, malformed PDFs… defended by a browser tab"*) and **Tesseract.js at 1–3
   s/page**. Neither is about detection. **Parse-in-cloud / detect-on-device satisfies ADR 0008's
   stated reasoning exactly.**

4. **The backend stays tiny.** No torch, no transformers, no model warmup. `fastapi` + `pypdf` (+ DOCX
   via stdlib `zipfile`) and a Dockerfile the team can run — which is the difference between a team
   test that happens and one that stalls on a ~1 GB image pull.

### The accepted cost

L2 must now run over the whole extract on-device. At the 100 000-character cap *(estimate)* that is
roughly 25 000 tokens ≈ 50 chunks at `max_position_embeddings = 512`, which at an unmeasured
per-chunk cost is **seconds, not milliseconds** *(estimate — no tokens/sec figure exists in this
package)*. **This is acceptable only because the File pane is asynchronous by design** — it is doc
06 §1's **soft** deadline (*"the modal, which the user is reading"*), not the hard gate. The hard
gate is still the prompt.

### Sales sentence — do not quietly restate ADR 0008

This makes the file story:

> *"Your file is parsed in-region under our DPA, zero-retention; detection still runs on your
> machine."*

**That is stronger than what ADR 0008 promised.** ADR 0008 said files go to the cloud; this narrows
*what* goes (bytes for parsing/redaction only) and *what happens there* (extract + format-preserving
mask application — **no findings, no model**). Do not cite ADR 0008 as having already said
"detection on-device for files" — it did not; this ADR adds that refinement.

## If the founder overrules

The plan changes in **exactly one place:** the backend response model gains a `findings` array and
the extension consumes it instead of calling `scanInto`. Everything else (attach-time interception,
format-preserving redaction, F4, review UI) stands.

## Consequences

- Backend contract is **`ExtractResponse` / `RedactResponse` only** — see `code/backend/app/models.py`.
- Extension `src/files/pipeline.ts` is the only file state machine; `scanInto` reuses the prompt
  detector stack (ADR 0013 monotonic rule applies per file).
- Zero-retention still means **no findings, no extract, no bytes in logs** (F4, doc 02 §4.3) — the
  backend never runs NER and never stores content between extract and redact except in the request
  lifetime.
- Team test requires **both** processes: `docker compose up` for the API and the extension with API
  URL in Options.
