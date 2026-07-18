# Slice 2 — File Content Checking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Slice 1 extension so that a file attached to ChatGPT or Claude is intercepted before it reaches the provider, parsed to text by our backend, scanned by the **same on-device L1+L2 detector stack** the prompt uses, reviewed span-by-span in the existing Send review surface, and replaced by a cleaned attachment that the **user** then sends.

**Architecture:** The extension captures the file at **attach time** (not Send time — see §Pushback 1), holds the bytes in memory, and POSTs them to a Python/FastAPI service that returns **plain extracted text plus an offset map and coverage metadata — no findings**. Detection stays on-device (see §Pushback 2). The Send review modal grows a second pane (`Prompt | File`) that reuses `send-review-logic.ts` unchanged; **the extracted text is a decision surface, not the output format.** On Proceed the extension re-uploads the original bytes with the accepted spans to `POST /v1/redact`, which applies the masks **in the original format** — a DOCX returns a DOCX with `word/media/` intact, a PDF returns a PDF with its image XObjects intact — and that file is re-attached. A clean or fully-ignored file is re-attached as the **untouched original bytes**.

**Two calls, and the reason is F4:** the backend retains nothing between them, so the extension re-uploads. The redact call carries the extract's SHA-256 and the backend **recomputes the extract and refuses on mismatch** — a redaction applied against offsets from a different parse is worse than no redaction, and it must fail loudly rather than approximately.

**Tech Stack:** TypeScript / WXT / Preact (extension, existing) · Python 3.11 + FastAPI + Pydantic + uvicorn (backend, ADR 0007) · `pypdf` (PDF text layer) · stdlib `zipfile` + `xml.etree` (DOCX) · `vitest` (extension tests) · `pytest` + `httpx` (backend tests) · Docker Compose for the team test.

---

## Global Constraints

Copied verbatim from the governing documents. Every task inherits these.

1. **Decision #8 — no auto-submit, ever.** Proceed prepares the composer and the attachment. **The user presses Send.**
2. **Decision #2 (files half) — ADR 0008:** file bytes go to our backend, **in-region, zero-retention, under DPA**. Prompt text still never leaves the device.
3. **F4 — zero retention.** *"Zero-retention is not an architecture decision you make once. It's a property you defend against your own future engineers' good ideas."* (doc 02 §4.3). **No disk spool, no retry queue, no dead-letter queue, no APM body capture, no content in logs.**
4. **Decision #5 / I3 / U26 — audit is class + count + salted-hash fingerprint.** Never the raw value, never the file bytes, never the extract. Ignore reasons are redacted of detected values before storage (existing `redactReason` in `src/audit/audit.ts`).
5. **ADR 0018 §4 — sensitivity does NOT gate files.** Slice 2 runs the **same** L1 + stock-NER stack Slice 1 runs. No sensitive-vs-not model. **L1 remains the sole owner of NRIC / SSM / TIN digits.**
6. **ADR 0026 — Report is OUT of Slice 2 MVP.** Accept / Ignore only. No feedback upload, no suppress-list, no fingerprint memory across uploads.
7. **ADR 0014 — degrade to advisory, never fail-closed.** An unreadable, oversized, or timed-out file must not permanently block the user; it must be *clearly explained* and escapable with an audited reason. Blocking outright relocates the leak to the ChatGPT desktop app (doc 00 §1.4).
8. **ADR 0013 — the verdict cache is monotonic toward dirty.** L1 may write DIRTY; only a completed L1+L2 scan may write CLEAN. This applies per-file exactly as it applies per-prompt.
9. **ADR 0017 §5 guardrail — ordinary arithmetic is not sensitive.** Unchanged; the L1 detectors are reused as-is, so this holds by construction. **A CSV column of quantities must not fire L1.** Review gate, not assumption.
10. **ADR 0005 / 0010 — `composedPath()`, never `event.target`; listeners register at `window`, capture phase, at `document_start`.** The file interceptor uses the identical mechanism U12 validated for keydown.
11. **No invented constants presented as decided.** Every limit in this plan is tagged `(estimate)` and lives in one named config module with the tag in a comment, per `code/README.md`: *"the scaffold does not launder an estimate into a constant by writing it in code."*
12. *(Folded into 14 — see below.)*
13. **`dist/` is committed and must match `src/`** (ADR 0017 §3). `pnpm check:dist` must pass before every commit that touches extension source.
14. 🔴 **Commit after every task, sole author `JeffTiong1031 <jefftiong1031@gmail.com>`.** **No `Co-Authored-By` trailer of any kind** — not Claude, not Cursor, not any AI tool, not a subagent. `git config user.name/user.email` is already correct, so authorship is right by default; the requirement is to **omit the trailer**, which some agent harnesses add automatically. **Check `git log -1 --format=%B` after each commit** — a trailer added by a tool is still a claim about who wrote the code.
15. 🔴 **Format-preserving redaction is the happy path.** A masked DOCX comes back as a **DOCX**; a masked PDF comes back as a **PDF**. Downgrading to `.txt` is the **CSV/TXT** behaviour and, for DOCX/PDF, a **founder-gated fallback only** after a spike failure — never a silent default. See Task 12 and the amended ADR 0027.

---

## Pushback — three places the brief as written does not survive contact

The founder asked for pushback where scope is dishonest and invited a better *implementation* shape. Three findings, in descending order of how much they change the plan.

### Pushback 1 🔴 — Gating at Send is too late. The file has already been uploaded.

**The brief's workflow step 1 is:** *"User attaches file + types prompt → presses Send."* Step 7 is: *"the original dirty file must not upload unchanged."*

**These two are incompatible on both target surfaces.** ChatGPT and Claude both upload an attachment **on attach** — the progress bar and the file chip that appear the moment you pick a file are the upload, not a preview. By the time the user presses Send, the bytes are on the provider's servers. A Send-time gate would produce a product that shows a review modal about a file the provider already has, and then attaches a cleaned copy *in addition*. **That is doc 00 §6's worst case exactly: the control appears to work and the audit trail says it worked.**

⚠️ **This is stated as a strong belief, not a verified fact.** It matches the observable UX of both products and it is the reason Task 1 is a spike, not an implementation. **`U27` is raised for it and the spike is the plan's rework trigger** — the same discipline doc 05 §1 imposed on U12: *"must be proven empirically, per surface — not reasoned about."*

**The fix, and it pays for itself:** intercept at **attach** — a `window`-capture listener on `change` / `drop` / `paste`, `stopImmediatePropagation()`, clear the input, keep the bytes in memory. The provider never sees the file. Our own chip renders in the composer.

**And this is what makes the brief's progressive UI free rather than a feature to build.** The scan starts at attach, so by the time the user finishes typing and presses Send, the File pane is usually already populated. The brief's *"File tab shows Checking… until the API returns"* becomes the cold-start case rather than the normal one.

**The workflow the founder specified is preserved end to end.** What moves is *when the network call fires*, which the user never sees. Nothing in steps 3–10 changes.

### Pushback 2 🟠 — The backend should parse, not detect. `/extract`, not `/scan`.

**The brief specifies:** `POST /scan (file) → size/type checks → parse → L1 + stock NER → JSON { extract, findings }`.

**Recommendation: the backend returns `{ extract, coverage }` and the extension runs the detectors it already has.** Four reasons, and the first is the one that matters:

1. 🔴 **Otherwise L1 exists twice.** The NRIC / SSM / `NRIC_OR_SSM_AMBIGUOUS` / TIN / email / Luhn grammars are ~200 lines of TypeScript in `src/detection/l1/` with a test suite. A Python copy is a **second source of truth for the package's most precision-critical layer**, and it will drift. This repo's own ledger (CLAUDE.md §2) is eleven entries of one truth recorded in two places and only one of them being corrected. **Do not create a twelfth on purpose, in the layer whose precision ADR 0001 calls quasi-contractual.**
2. **ADR 0018 §Consequences requires a narrow seam:** *"the integration seam is a single interface: the extension calls a detector that returns spans + labels; today it is stock NER, later it is the trained model. Keeping that seam narrow in Slice 1 is now a design requirement."* A backend detector opens a **second** seam that the post-Slice-2 sensitive-vs-not integration would then have to replace twice.
3. **It matches ADR 0008's actual argument rather than its summary.** Re-reading *"Why not A"*: on-device files were rejected for the **hostile-format parser attack surface** (*"zip bombs, malformed PDFs… defended by a browser tab"*) and **Tesseract.js at 1–3 s/page**. Neither is about detection. **Parse-in-cloud / detect-on-device satisfies ADR 0008's stated reasoning exactly** and does not weaken the sales sentence — it strengthens it: *"your file is parsed in-region under our DPA, zero-retention, and the detection still runs on your machine."*
4. **The backend stays tiny.** No torch, no transformers, no model warmup, no ~1 GB image. `pip install fastapi pypdf` and a Dockerfile the team can run — which is the difference between a team test that happens and one that stalls on a 20-minute image pull.

**The cost, stated honestly:** L2 must now run over the whole extract on-device. At the 100 000-character cap set in Task 6 that is roughly 25 000 tokens ≈ 50 chunks at `max_position_embeddings = 512`, which at an unmeasured per-chunk cost is **seconds, not milliseconds** *(estimate — no tokens/sec figure exists in this package and this plan does not invent one)*. **This is acceptable only because the File pane is asynchronous by design** — it is doc 06 §1's *soft* deadline, not the hard gate. The hard gate is still the prompt.

**If the founder overrules this, the plan changes in exactly one place:** Task 5's response model gains a `findings` array and Task 10 consumes it instead of calling `scanInto`. Everything else stands.

### Pushback 3 🟠 — "Clean extract" is not "clean file", and saying otherwise is the letter-vs-purpose trap in a new place.

We scan **our extract**. We then re-attach **the original bytes** when the extract is clean (so a clean PDF keeps its formatting — see Task 12). **Those are different objects.** A PDF whose text layer is clean can carry an NRIC in a scanned page image, an XFA form field, or an embedded attachment. A DOCX can carry one in a tracked deletion or an embedded object.

**A verdict of CLEAN on the extract, presented as CLEAN on the file, is a silent fail-open.** This is the fourth-instance shape doc 02 §5.1 and doc 01 §5 both hit: the invariant's wording is satisfied and its purpose is defeated.

**The MVP fix is disclosure, not detection.** The backend returns a `coverage` object naming what it did **not** read, and the File pane renders it as a visible line — *"Read: text layer, 12/12 pages. Not read: 3 embedded images."* The user sees the boundary of the check. This costs almost nothing and it is the difference between a stated gap and a hidden one (doc 00 §7's underclaiming argument).

### Format scope — the founder's v1 list survives the check, with one merge and one hard rule

| | Verdict |
|---|---|
| **TXT, CSV** | ✅ v1. **Merged into one code path** — CSV is text with a row cap; a separate "CSV parser" would be ceremony. |
| **DOCX** | ✅ v1 — **but not via `python-docx`'s paragraph walk.** That iterator misses headers, footers, footnotes, endnotes, and comments. An NRIC in a Word comment would be invisible to us and visible to the provider. Task 4 walks the OOXML parts directly. |
| **PDF (text layer)** | ✅ v1 — **with an explicit `no_text_layer` error.** A scanned PDF yields zero characters, and *zero characters with a CLEAN verdict is the single most dangerous output this feature can produce.* Task 4 makes low text yield an **error**, never a clean scan. |
| **XLSX** | ⬜ Backlog #1. The extract is genuinely messy (sheet boundaries, formula vs. value, hidden sheets) and the review UX for a grid-as-text is a design problem, not a parser problem. Shipping it badly teaches the team the wrong thing. |
| **PPTX** | ⬜ Backlog #2. Same OOXML machinery as DOCX; cheap once DOCX lands. |
| **JPG / PNG / scanned PDF (OCR)** | ⬜ Backlog #3. A separate infrastructure decision (OCR engine, cost, latency, U7) and the one item that genuinely cannot ride Slice 2's shape. |

**No format is cut from the founder's proposed v1.** The check ran and it held; the changes are *how* two of them are parsed.

---

## File Map

### Create — extension (`code/extension/`)

| Path | Responsibility |
|---|---|
| `src/files/types.ts` | `HeldFile`, `FileStatus`, `Coverage`, `FileError` — the single vocabulary both panes and the store share. |
| `src/files/store.ts` | In-memory-only registry of held files, keyed by id. Never persisted (E2 spirit; nothing readable survives the tab). |
| `src/files/capture.ts` | The `window`-capture interceptor for `change` / `drop` / `paste`. Surface-agnostic. |
| `src/files/attach.ts` | `DataTransfer` re-attach — the write half of the interceptor, mirroring `adapter.writeText()`. |
| `src/files/api.ts` | `POST /v1/extract` and `POST /v1/redact` clients: multipart body, timeout, typed errors. |
| `src/files/cleaned.ts` | Chooses between the untouched original and the backend-redacted file. |
| `src/files/config.ts` | API base URL resolution (`chrome.storage.local` → default) and every client-side limit, each tagged `(estimate)`. |
| `src/files/pipeline.ts` | attach → extract → `scanInto` → status transitions. The only place file state machines live. |
| `src/ui/file-chip.ts` | The composer chip: filename, status, error text. Shadow root, `data-vanguard-ui`. |
| `src/ui/review-panes.ts` | Tab model for `Prompt | File(s)` — pure logic, no DOM. |
| `entrypoints/options/index.html`, `entrypoints/options/main.tsx` | API base URL field for the team test. |
| `tests/files/capture.test.ts`, `store.test.ts`, `api.test.ts`, `pipeline.test.ts`, `attach.test.ts` | |
| `tests/ui/review-panes.test.ts` | |

### Modify — extension

| Path | Change |
|---|---|
| `src/adapters/types.ts` | Add `fileInputs(): HTMLInputElement[]` and `dropTarget(): HTMLElement \| null` to `SurfaceAdapter`. |
| `src/adapters/chatgpt.ts`, `src/adapters/claude.ts` | Implement the two new members. |
| `src/ui/modal.tsx` | `ModalProps` gains `files`; render a tab strip and a File pane. **Reuses `buildPreviewSegments` / `SpanDecisionMap` unchanged.** |
| `src/ui/send-review-logic.ts` | Add `whyForClass` entries only if a file-specific class appears — **currently none does.** Otherwise untouched. |
| `entrypoints/content.ts` | Wire capture → pipeline → chip; extend `onBlocked` and `onProceed` for files. |
| `wxt.config.ts` | `host_permissions` += `http://localhost:8000/*` and the team-test origin; `options_ui`. |
| `code/extension/ACCEPTANCE.md` | Slice 2 acceptance section. |

### Create — backend (`code/backend/`)

| Path | Responsibility |
|---|---|
| `pyproject.toml` | `fastapi`, `uvicorn[standard]`, `pypdf`, `python-multipart`; dev: `pytest`, `httpx`. |
| `app/main.py` | FastAPI app, CORS for the two extension origins, router mount. |
| `app/models.py` | Pydantic request/response — the API contract, and the codegen source (ADR 0007). |
| `app/limits.py` | Every limit, one place, each `(estimate)`-tagged. |
| `app/safety.py` | Size cap, magic-byte sniff, ZIP-bomb guards, subprocess timeout harness. |
| `app/parsers/text.py`, `docx.py`, `pdf.py` | One parser per family. Pure functions: `bytes -> ExtractResult`. |
| `app/routes/extract.py` | Both endpoints — `/v1/extract` and `/v1/redact`. |
| `app/redact/docx.py`, `app/redact/pdf.py` | Apply accepted masks to the **original** bytes, format preserved, images kept. |
| `Dockerfile`, `docker-compose.yml` | The team's `docker compose up`. |
| `tests/…` (mirrors `app/`) + `tests/fixtures/` | Includes a generated zip bomb and a truncated PDF. |
| `README.md` | Rewrite: how to run it, what it does not retain. |

### Create — docs

- `docs/adr/0027-cleaned-extract-replaces-attachment.md`
- `docs/adr/0028-backend-parses-extension-detects.md`
- `ASSUMPTIONS.md` — register **U27** (attach-time interception) and **U28** (provider accepts a `DataTransfer`-set `input.files`).

---

## Task list

**Tasks 1 and 1B are stop conditions, and they are first on purpose.** **If Task 1 (U27) fails, stop and re-plan** — the whole architecture rests on it. **If Task 1B (U30) fails, stop and escalate to the founder** — the PDF half of Task 5B rests on it, and the tempting workaround is exactly the one Global Constraint 15 forbids. Neither is worked around; both are answered in 1–2 days each, before anything is built on them.

**Execution:** the founder runs this in Cursor via `superpowers:subagent-driven-development`, task by task with human gates. **Commit after every task per Global Constraint 14 — sole author, no AI co-author trailer of any kind.**

---

### Task 1: U27 spike — prove the file interceptor, on real ChatGPT and Claude

🔴 **This is Slice 2's rework trigger.** It is deliberately built as a zero-dependency raw-MV3 spike in `code/spikes/`, for the same reason `code/README.md` gives for the U12 harness: *"A build step between the claim and the browser makes a rework-trigger test ambiguous."*

**Files:**
- Create: `code/spikes/u27-file-capture/manifest.json`
- Create: `code/spikes/u27-file-capture/capture.js`
- Create: `code/spikes/u27-file-capture/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a written PASS/FAIL per surface for each of three claims, recorded in `ASSUMPTIONS.md` as **U27** and **U28**.

**The three claims, tested separately and reported separately** (doc 05 §1's rule: *"never test or report it as one claim"*):

- **U27-a** — a `window` capture listener on `change`, registered at `document_start`, fires before the page's handler, and `stopImmediatePropagation()` prevents the provider from uploading.
- **U27-b** — the same for drag-and-drop (`dragover` + `drop`) and for clipboard paste of a file.
- **U28** — setting `input.files` from a synthesized `DataTransfer` and dispatching `change` causes the provider to accept and upload *our* file.

- [ ] **Step 1: Write the manifest**

```json
{
  "manifest_version": 3,
  "name": "U27 file-capture spike",
  "version": "0.1.0",
  "content_scripts": [
    {
      "matches": ["https://chatgpt.com/*", "https://claude.ai/*"],
      "js": ["capture.js"],
      "run_at": "document_start",
      "world": "ISOLATED",
      "all_frames": true
    }
  ]
}
```

- [ ] **Step 2: Write the probe**

```js
// U27 — does an isolated-world window-capture listener beat the provider's uploader?
// Instrument only. Logs FILENAMES and SIZES, never file CONTENT (U26's lesson).
const log = [];
const rec = (evt, detail) => {
  const row = { t: Date.now(), evt, ...detail };
  log.push(row);
  console.log('[U27]', JSON.stringify(row));
};

window.addEventListener('change', (e) => {
  const el = e.composedPath().find((n) => n instanceof HTMLInputElement && n.type === 'file');
  if (!el) return;
  const names = [...(el.files || [])].map((f) => ({ name: f.name, size: f.size, type: f.type }));
  rec('change', { at: 'window', phase: 'capture', names, blocked: true });
  e.stopImmediatePropagation();
  e.preventDefault();
  el.value = '';
}, true);

window.addEventListener('drop', (e) => {
  const names = [...(e.dataTransfer?.files || [])].map((f) => ({ name: f.name, size: f.size }));
  if (!names.length) return;
  rec('drop', { at: 'window', phase: 'capture', names, blocked: true });
  e.stopImmediatePropagation();
  e.preventDefault();
}, true);
window.addEventListener('dragover', (e) => e.preventDefault(), true);

window.addEventListener('paste', (e) => {
  const items = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file');
  if (!items.length) return;
  rec('paste', { at: 'window', phase: 'capture', count: items.length, blocked: true });
  e.stopImmediatePropagation();
  e.preventDefault();
}, true);

// U28 — re-attach probe. Call from the console: __u27_reattach()
window.__u27_reattach = () => {
  const input = document.querySelector('input[type=file]');
  if (!input) return rec('reattach', { ok: false, why: 'no input[type=file] found' });
  const dt = new DataTransfer();
  dt.items.add(new File(['hello from vanguard'], 'vanguard-test.txt', { type: 'text/plain' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  rec('reattach', { ok: input.files.length === 1, name: input.files[0]?.name });
};

window.__u27_dump = () => JSON.stringify(log, null, 2);
rec('installed', { href: location.href });
```

- [ ] **Step 3: Run it, by hand, on both surfaces**

Load unpacked. On **chatgpt.com** and then on **claude.ai**, in this order:

1. Click the attach button, pick a small `.txt`. **Record: does a file chip / upload progress bar appear?** Expected on PASS: **no chip, no progress bar, no network upload.**
2. Open DevTools → Network, filter by the file's size. **Record whether any request carries the file.** This is the actual verdict — the absence of a chip is a visual proxy, and doc 05 §1.2's visual criterion is a *supporting* signal, not the measurement.
3. Drag the same file onto the composer. Repeat 1–2.
4. Copy an image to the clipboard, paste into the composer. Repeat 1–2.
5. In the console, run `__u27_reattach()`. **Record: does the provider show a chip for `vanguard-test.txt`, and does it upload?**
6. `copy(__u27_dump())` and save to `code/spikes/u27-file-capture/captures/<surface>-<date>.json`.

- [ ] **Step 4: Record the verdict — three rows, not one**

Write `code/spikes/u27-file-capture/README.md` with a table of `U27-a / U27-b / U28 × {chatgpt, claude}`, each PASS/FAIL, each with the **network** evidence, not the visual one.

🔴 **Read the raw capture before writing the verdict.** CLAUDE.md §2 ledger #11: the analyser was right and the input was empty. If a row says `blocked: true` but the Network tab shows an upload, **the Network tab wins.**

🔴 **If U27-a fails on either surface, STOP.** The plan's shape is wrong and the remaining tasks are built on it. Report the failure and re-plan; do not narrow a timing window to make it pass (§9's rule: *"Fix the attribution, or fix the capture. Never the tolerance."*).

- [ ] **Step 5: Register U27 and U28 in `ASSUMPTIONS.md` §3, with the verdicts and the scope**

Scope wording matters and the U12-b lesson applies directly: this is **two websites on one date**, not *"providers cannot upload behind a content script."* It moves on the **D4** clock.

- [ ] **Step 6: Commit**

```bash
git add code/spikes/u27-file-capture ASSUMPTIONS.md
git commit -m "spike(u27): file-capture interception harness + verdicts for ChatGPT and Claude"
```

---

### Task 1B: U30 spike — can we redact a PDF in place, keeping its images?

🔴 **The second stop condition, and it is the founder's call, not the engineer's.** Format-preserving DOCX redaction is ordinary XML surgery. **PDF is not.** There is no stable, documented mapping from `extract_text()` offsets back to content-stream text positions, so the whole PDF half of Task 12 rests on a library behaving well on real files. **Run this before building anything that depends on it.**

**Files:**
- Create: `code/spikes/u30-pdf-redact/probe.py`
- Create: `code/spikes/u30-pdf-redact/README.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a written PASS/FAIL for **U30**, and — on FAIL — a founder decision, not an engineering workaround.

**The claim under test (U30):** for a set of real work PDFs, every accepted span can be located and **removed** (not merely covered), the output opens cleanly in Chrome's viewer and Acrobat, and embedded images survive.

- [ ] **Step 1: Write the probe**

```python
"""U30 -- in-place PDF text redaction that keeps images.

pypdf can READ a text layer; it cannot reliably REMOVE text at a position.
PyMuPDF's add_redact_annot/apply_redactions is the only mature route, so the
spike is really "does PyMuPDF hold up on our inputs, and can we use it."

🔴 LICENSING IS PART OF THE VERDICT, NOT A FOOTNOTE. PyMuPDF is AGPL-3.0 or
commercial. Shipping AGPL code in a distributed product is a diligence finding
if nobody decided it on purpose. A PASS here is "it works AND we know what it
costs to use", never just the first half.
"""
import sys
from pathlib import Path

import fitz  # PyMuPDF


def redact(path: Path, spans: list[str], out: Path) -> dict:
    doc = fitz.open(path)
    images_before = sum(len(p.get_images(full=True)) for p in doc)
    hits = {s: 0 for s in spans}

    for page in doc:
        for span in spans:
            # 🔴 search_for finds EVERY occurrence, not the one span the user
            # reviewed. Over-redaction is the fail-safe direction, but it IS a
            # semantic change and the review UI must not imply otherwise.
            for rect in page.search_for(span):
                page.add_redact_annot(rect, fill=(0, 0, 0))
                hits[span] += 1
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)  # keep images

    doc.save(out, garbage=3, deflate=True)
    images_after = sum(len(p.get_images(full=True)) for p in fitz.open(out))
    residual = "\n".join(p.get_text() for p in fitz.open(out))

    return {
        "hits": hits,
        "missed": [s for s, n in hits.items() if n == 0],
        "still_present": [s for s in spans if s in residual],
        "images_before": images_before,
        "images_after": images_after,
    }


if __name__ == "__main__":
    src = Path(sys.argv[1])
    spans = sys.argv[2:]
    result = redact(src, spans, src.with_suffix(".redacted.pdf"))
    for key, value in result.items():
        print(f"{key}: {value}")
```

- [ ] **Step 2: Assemble the corpus — real files, not generated ones**

🔴 **A generated PDF will pass this spike and prove nothing.** The failure modes are all artifacts of real producers: ligatures (`ﬁ`), hyphenation across lines, spans split across text-showing operators, rotated or multi-column layout, and text drawn as vectors. **Collect at least 8 real PDFs** the team would plausibly attach — an invoice, a payslip, a bank statement, a Word-exported report, a scanner-plus-OCR output, a LaTeX paper, a slide export, and one government form. **Use files with no real personal data in them, or the founder's own** — this is a spike, not an eval, and ADR 0015/U25 are not in scope here.

- [ ] **Step 3: Run it and record per-file results**

```bash
cd code/spikes/u30-pdf-redact
pip install pymupdf
python probe.py samples/payslip.pdf "880101-14-5566" "Ahmad bin Ali"
```

For each file record: **missed** (span never located), **still_present** (span located but survived removal — the dangerous one), `images_before` vs `images_after`, and whether the output opens in Chrome and Acrobat without a repair prompt.

- [ ] **Step 4: Write the verdict, with the licence answer in it**

`README.md` carries a table of file × {missed, still_present, images kept, opens cleanly} plus a **Licensing** section stating which of AGPL-compliance / commercial licence / neither the founder has chosen.

**PASS requires all four:** zero `still_present` across every file · `images_after == images_before` · every output opens without repair · a licence position exists.

🔴 **`missed` is not automatically a FAIL, and this is the subtle part.** A span we cannot locate is a span we cannot redact — but if the pipeline **detects the miss and refuses** rather than saving a file it believes is clean, the failure is loud and safe. **`still_present` is the fatal one:** the span was found, the redaction was applied, the text survived, and we hand the user a file we have told them is masked. **That is the audit-trail-says-it-worked failure the whole product exists to prevent.**

- [ ] **Step 5: On FAIL — STOP and escalate. Do not work around it.**

Founder decision between: **(i)** a commercial PyMuPDF licence · **(ii)** PDF-only `.txt` fallback, disclosed in the UI · **(iii)** PDF masking deferred to backlog, with PDFs offering only Ignore-or-remove in v1. 🔴 **Do not pick (ii) silently because it is the easiest** — Global Constraint 15 exists precisely because `.txt` is the tempting quiet default.

- [ ] **Step 6: Register U30 in `ASSUMPTIONS.md` §3 and commit**

```bash
git add code/spikes/u30-pdf-redact ASSUMPTIONS.md
git commit -m "spike(u30): in-place PDF redaction feasibility and licensing verdict"
```

---

### Task 2: The API contract — Pydantic models first, no endpoint yet

Defining the contract before either side is built is what lets Tasks 3–8 (backend) and Tasks 9–13 (extension) proceed independently.

**Files:**
- Create: `code/backend/pyproject.toml`
- Create: `code/backend/app/__init__.py`, `code/backend/app/models.py`
- Create: `code/backend/app/limits.py`
- Test: `code/backend/tests/test_models.py`

**Interfaces:**
- Consumes: Task 1's verdict (that there is a file to send at all).
- Produces: `ExtractResponse`, `RedactRequest`, `RedactSpan`, `ErrorResponse`, `Coverage`, `ErrorCode` — consumed by every backend task and mirrored by `src/files/types.ts` in Task 9.

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "vanguard-backend"
version = "0.2.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.30",
  "python-multipart>=0.0.9",
  "pypdf>=5.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "httpx>=0.27"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: Write the limits module**

```python
"""Every Slice 2 limit, in one place.

🔴 Each value is an (estimate). None is derived from a measurement, and
`code/README.md` forbids laundering an estimate into a decided constant:
"A number in a config file looks decided."  Revisit after the team test.
"""

MAX_UPLOAD_BYTES = 10 * 1024 * 1024        # 10 MB   (estimate)
MAX_EXTRACT_CHARS = 100_000                # ~25k tokens ~50 chunks  (estimate)
MAX_PDF_PAGES = 100                        # (estimate)
MAX_CSV_ROWS = 20_000                      # (estimate)

# OOXML containers are ZIPs, so they are zip-bomb carriers.
MAX_ZIP_ENTRIES = 1_000                    # (estimate)
MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024   # 100 MB (estimate)
MAX_ZIP_RATIO = 100                        # uncompressed:compressed (estimate)

PARSE_TIMEOUT_SECONDS = 10.0               # hard wall clock per parse (estimate)
REQUEST_TIMEOUT_SECONDS = 30.0             # (estimate)

# A PDF that yields fewer than this many characters per page is treated as
# having no usable text layer -> ERROR, never a clean scan. See Pushback 3.
MIN_CHARS_PER_PAGE = 8                     # (estimate)
```

- [ ] **Step 3: Write the failing model test**

```python
import pytest
from pydantic import ValidationError
from app.models import Coverage, ErrorCode, ErrorResponse, ExtractResponse


def test_extract_response_round_trips():
    r = ExtractResponse(
        extract="Ahmad bin Ali, 880101-14-5566",
        chars=29,
        truncated=False,
        format="docx",
        coverage=Coverage(
            read=["body", "headers", "footers", "comments"],
            not_read=["3 embedded images"],
            pages_total=None,
            pages_with_text=None,
        ),
        warnings=[],
    )
    assert r.model_dump()["coverage"]["not_read"] == ["3 embedded images"]


def test_error_response_uses_the_closed_code_set():
    e = ErrorResponse.of(ErrorCode.TOO_LARGE, "This file is 24 MB. The limit is 10 MB.")
    assert e.error.code == "too_large"
    assert e.error.message.startswith("This file is")


def test_error_code_set_is_closed():
    with pytest.raises(ValueError):
        ErrorCode("something_new")


def test_extract_response_carries_a_hash_the_redact_call_can_verify():
    from app.models import RedactRequest, RedactSpan
    r = ExtractResponse(
        extract="Ahmad 880101-14-5566",
        extract_sha256="a" * 64,
        chars=20,
        truncated=False,
        format="docx",
        coverage=Coverage(read=["body"], not_read=[], pages_total=None, pages_with_text=None),
        warnings=[],
    )
    req = RedactRequest(
        extract_sha256=r.extract_sha256,
        spans=[RedactSpan(start=6, end=20, text="880101-14-5566", placeholder="NRIC_1")],
    )
    assert req.spans[0].placeholder == "NRIC_1"


def test_redact_span_rejects_an_inverted_range():
    from app.models import RedactSpan
    with pytest.raises(ValidationError):
        RedactSpan(start=20, end=6, text="x", placeholder="NRIC_1")
```

- [ ] **Step 4: Run it and watch it fail**

```bash
cd code/backend && python -m pytest tests/test_models.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.models'`

- [ ] **Step 5: Write the models**

```python
from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


class ErrorCode(str, Enum):
    TOO_LARGE = "too_large"
    UNSUPPORTED_TYPE = "unsupported_type"
    PASSWORD_PROTECTED = "password_protected"
    NO_TEXT_LAYER = "no_text_layer"
    PARSE_FAILED = "parse_failed"
    TIMEOUT = "timeout"
    SUSPICIOUS_ARCHIVE = "suspicious_archive"
    # /v1/redact only:
    EXTRACT_MISMATCH = "extract_mismatch"     # re-parse disagreed with the reviewed extract
    REDACTION_FAILED = "redaction_failed"     # a span could not be located or removed


class Coverage(BaseModel):
    """What we read and — load-bearing — what we did not.

    Pushback 3: a CLEAN verdict on the extract is not a CLEAN verdict on the
    file. `not_read` is rendered in the review pane so the boundary of the
    check is visible to the user rather than implied.
    """
    read: list[str] = Field(default_factory=list)
    not_read: list[str] = Field(default_factory=list)
    pages_total: Optional[int] = None
    pages_with_text: Optional[int] = None


class ExtractResponse(BaseModel):
    extract: str
    #: SHA-256 of `extract`. The redact call sends it back; the backend
    #: re-parses and refuses if the hash differs. Offsets reviewed against one
    #: parse must never be applied against another -- see RedactRequest.
    extract_sha256: str
    chars: int
    truncated: bool
    format: Literal["txt", "csv", "docx", "pdf"]
    coverage: Coverage
    warnings: list[str] = Field(default_factory=list)


class RedactSpan(BaseModel):
    """One accepted mask, in EXTRACT coordinates.

    `text` is carried alongside the offsets deliberately: DOCX redaction maps
    by offset (exact), PDF redaction locates by string search (U30). Sending
    both means one contract serves both mechanisms.
    """
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    text: str
    placeholder: str

    @field_validator("end")
    @classmethod
    def _ordered(cls, end: int, info) -> int:
        start = info.data.get("start")
        if start is not None and end <= start:
            raise ValueError("end must be greater than start")
        return end


class RedactRequest(BaseModel):
    """Sent as the `spec` field of the multipart body, beside `file`.

    🔴 The ORIGINAL bytes are re-uploaded because the backend kept nothing
    (F4). That is the cost of zero retention and it is the right trade: a
    server-side cache of "the file we are about to redact" is precisely doc 02
    section 4.3's "silently degrades zero retention to short retention".
    """
    extract_sha256: str
    spans: list[RedactSpan]


class ErrorBody(BaseModel):
    code: ErrorCode
    message: str          # user-facing, already phrased for a non-engineer


class ErrorResponse(BaseModel):
    error: ErrorBody

    @classmethod
    def of(cls, code: ErrorCode, message: str) -> "ErrorResponse":
        return cls(error=ErrorBody(code=code, message=message))
```

- [ ] **Step 6: Run the tests**

```bash
cd code/backend && python -m pytest tests/test_models.py -v
```
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add code/backend
git commit -m "feat(backend): Slice 2 extract API contract and limits module"
```

---

### Task 3: Safety layer — size, sniffing, and the ZIP-bomb guard

**Files:**
- Create: `code/backend/app/safety.py`
- Test: `code/backend/tests/test_safety.py`
- Create: `code/backend/tests/fixtures/make_fixtures.py`

**Interfaces:**
- Consumes: `app.limits`, `app.models.ErrorCode`.
- Produces: `SafetyError(code, message)`, `sniff_format(name, data) -> str`, `guard_zip(data) -> None`, `run_with_timeout(fn, data, seconds) -> Any`.

- [ ] **Step 1: Write the fixture generator**

```python
"""Generate hostile fixtures. Committed as a script, not as binaries."""
import io, zipfile
from pathlib import Path

HERE = Path(__file__).parent


def zip_bomb() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("word/document.xml", b"\0" * (200 * 1024 * 1024))
    return buf.getvalue()


def many_entries() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for i in range(5_000):
            z.writestr(f"f{i}.xml", b"x")
    return buf.getvalue()


def truncated_pdf() -> bytes:
    return b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n"  # no xref


if __name__ == "__main__":
    (HERE / "zip_bomb.docx").write_bytes(zip_bomb())
    (HERE / "many_entries.docx").write_bytes(many_entries())
    (HERE / "truncated.pdf").write_bytes(truncated_pdf())
    print("fixtures written to", HERE)
```

- [ ] **Step 2: Write the failing safety tests**

```python
import pytest
from pathlib import Path
from app.models import ErrorCode
from app.safety import SafetyError, guard_zip, run_with_timeout, sniff_format

FIX = Path(__file__).parent / "fixtures"


def test_sniff_prefers_magic_bytes_over_the_filename():
    # A PDF renamed to .docx must be treated as a PDF, not trusted by extension.
    assert sniff_format("payroll.docx", b"%PDF-1.7\n...") == "pdf"


def test_sniff_rejects_an_unsupported_type():
    with pytest.raises(SafetyError) as e:
        sniff_format("photo.jpg", b"\xff\xd8\xff\xe0blah")
    assert e.value.code == ErrorCode.UNSUPPORTED_TYPE


def test_guard_zip_rejects_a_compression_bomb():
    with pytest.raises(SafetyError) as e:
        guard_zip((FIX / "zip_bomb.docx").read_bytes())
    assert e.value.code == ErrorCode.SUSPICIOUS_ARCHIVE


def test_guard_zip_rejects_too_many_entries():
    with pytest.raises(SafetyError) as e:
        guard_zip((FIX / "many_entries.docx").read_bytes())
    assert e.value.code == ErrorCode.SUSPICIOUS_ARCHIVE


def test_guard_zip_accepts_an_ordinary_archive():
    import io, zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", "<w:t>hello</w:t>")
    guard_zip(buf.getvalue())  # must not raise


def test_run_with_timeout_kills_a_hanging_parser():
    with pytest.raises(SafetyError) as e:
        run_with_timeout(_spin, b"", seconds=0.5)
    assert e.value.code == ErrorCode.TIMEOUT


def _spin(_data: bytes):
    while True:
        pass
```

- [ ] **Step 3: Run and watch it fail**

```bash
cd code/backend && python tests/fixtures/make_fixtures.py && python -m pytest tests/test_safety.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.safety'`

- [ ] **Step 4: Implement the safety layer**

```python
import io
import zipfile
from concurrent.futures import ProcessPoolExecutor, TimeoutError as FuturesTimeout
from typing import Any, Callable

from app import limits
from app.models import ErrorCode


class SafetyError(Exception):
    def __init__(self, code: ErrorCode, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


_MAGIC: list[tuple[bytes, str]] = [
    (b"%PDF-", "pdf"),
    (b"PK\x03\x04", "zip"),   # OOXML container; refined below
]


def sniff_format(filename: str, data: bytes) -> str:
    """Magic bytes first, filename second.

    A renamed file is the cheapest attack there is, and trusting the
    extension is how a PDF parser gets handed a ZIP.
    """
    head = data[:8]
    for magic, kind in _MAGIC:
        if head.startswith(magic):
            if kind != "zip":
                return kind
            # OOXML: only DOCX is supported in v1. Distinguish by part name.
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as z:
                    names = set(z.namelist())
            except zipfile.BadZipFile as exc:
                raise SafetyError(
                    ErrorCode.PARSE_FAILED,
                    "This file looks damaged and could not be opened.",
                ) from exc
            if "word/document.xml" in names:
                return "docx"
            if any(n.startswith("xl/") for n in names):
                raise SafetyError(
                    ErrorCode.UNSUPPORTED_TYPE,
                    "Excel files aren't checked yet. Please paste the relevant "
                    "rows into the chat instead, or export them as CSV.",
                )
            if any(n.startswith("ppt/") for n in names):
                raise SafetyError(
                    ErrorCode.UNSUPPORTED_TYPE,
                    "PowerPoint files aren't checked yet. Please export the "
                    "slides as PDF and attach that instead.",
                )
            raise SafetyError(
                ErrorCode.UNSUPPORTED_TYPE,
                "This archive type isn't supported.",
            )

    lowered = filename.lower()
    if lowered.endswith(".csv"):
        return "csv"
    if lowered.endswith((".txt", ".md", ".log")):
        return "txt"
    raise SafetyError(
        ErrorCode.UNSUPPORTED_TYPE,
        "Vanguard can check .txt, .csv, .docx and text-based .pdf files. "
        "This one isn't one of those, so it was not sent to the AI.",
    )


def guard_zip(data: bytes) -> None:
    """Reject compression bombs BEFORE any entry is decompressed."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            infos = z.infolist()
    except zipfile.BadZipFile as exc:
        raise SafetyError(
            ErrorCode.PARSE_FAILED, "This file looks damaged and could not be opened."
        ) from exc

    if len(infos) > limits.MAX_ZIP_ENTRIES:
        raise SafetyError(
            ErrorCode.SUSPICIOUS_ARCHIVE,
            "This document contains an unusual number of internal parts and "
            "was not opened. It has not been sent to the AI.",
        )

    total_uncompressed = sum(i.file_size for i in infos)
    total_compressed = max(1, sum(i.compress_size for i in infos))
    if total_uncompressed > limits.MAX_ZIP_UNCOMPRESSED_BYTES:
        raise SafetyError(
            ErrorCode.SUSPICIOUS_ARCHIVE,
            "This document expands to an unexpectedly large size and was not "
            "opened. It has not been sent to the AI.",
        )
    if total_uncompressed / total_compressed > limits.MAX_ZIP_RATIO:
        raise SafetyError(
            ErrorCode.SUSPICIOUS_ARCHIVE,
            "This document expands to an unexpectedly large size and was not "
            "opened. It has not been sent to the AI.",
        )


def run_with_timeout(fn: Callable[[bytes], Any], data: bytes, seconds: float) -> Any:
    """Run a parser in a separate PROCESS so a pathological input can be killed.

    A thread cannot be killed in CPython, so a thread-plus-timeout would leave
    a spinning parser holding a worker forever -- a self-inflicted DoS while
    reporting a clean timeout. The process pool is the honest mechanism.
    """
    with ProcessPoolExecutor(max_workers=1) as pool:
        future = pool.submit(fn, data)
        try:
            return future.result(timeout=seconds)
        except FuturesTimeout as exc:
            for proc in pool._processes.values():
                proc.kill()
            raise SafetyError(
                ErrorCode.TIMEOUT,
                "This file took too long to read, so it was not checked and "
                "has not been sent to the AI.",
            ) from exc
```

- [ ] **Step 5: Run the tests**

```bash
cd code/backend && python -m pytest tests/test_safety.py -v
```
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add code/backend
git commit -m "feat(backend): hostile-input safety layer - sniffing, zip-bomb guard, killable parse timeout"
```

---

### Task 4: The three parsers

**Files:**
- Create: `code/backend/app/parsers/__init__.py`, `text.py`, `docx.py`, `pdf.py`
- Test: `code/backend/tests/test_parsers.py`

**Interfaces:**
- Consumes: `app.limits`, `app.safety.SafetyError`, `app.models.{Coverage, ErrorCode}`.
- Produces: `ExtractResult = tuple[str, Coverage, list[str], list[NodeRef]]` and three functions `parse_text(data) / parse_docx(data) / parse_pdf(data) -> ExtractResult`, plus `truncate(text) -> tuple[str, bool]` and `NodeRef`.

🔴 **The fourth element is what makes Task 12's format-preserving redaction possible.** A `NodeRef` records *where in the source a run of extract characters came from* — `(part, node_index, extract_start, length)`. DOCX populates it; **TXT/CSV return `[]` because the extract is the file, and PDF returns `[]` because it redacts by string search (U30), not by offset.** Naming the map in the shared return type rather than bolting it onto DOCX later is what stops the redact endpoint growing per-format branches at three call sites.

- [ ] **Step 1: Write the failing parser tests**

```python
import io
import zipfile
from pathlib import Path

import pytest

from app.models import ErrorCode
from app.parsers.docx import parse_docx
from app.parsers.pdf import parse_pdf
from app.parsers.text import parse_text, truncate
from app.safety import SafetyError

FIX = Path(__file__).parent / "fixtures"


def _docx(parts: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, body in parts.items():
            z.writestr(name, body)
    return buf.getvalue()


NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def test_text_decodes_utf8_and_reports_coverage():
    extract, coverage, _, _ = parse_text("notes.txt", "Ahmad 880101-14-5566".encode())
    assert "880101-14-5566" in extract
    assert coverage.read == ["file text"]


def test_text_survives_a_bad_encoding_rather_than_failing_the_scan():
    extract, _, warnings, _ = parse_text("notes.txt", b"caf\xe9 880101-14-5566")
    assert "880101-14-5566" in extract
    assert any("encoding" in w for w in warnings)


def test_truncate_flags_when_it_cuts():
    body, cut = truncate("x" * 200_000)
    assert cut is True
    assert len(body) == 100_000


def test_docx_reads_the_body():
    data = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>Ahmad 880101-14-5566</w:t></w:p></w:body></w:document>",
    })
    extract, coverage, _, _ = parse_docx(data)
    assert "880101-14-5566" in extract
    assert "body" in coverage.read


def test_docx_reads_comments_headers_and_footnotes():
    # python-docx's paragraph walk misses every one of these. An NRIC in a
    # Word comment must not be invisible to us and visible to the provider.
    data = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>clean body</w:t></w:p></w:body></w:document>",
        "word/comments.xml": f"<w:comments {NS}><w:comment><w:p><w:t>his IC is 880101-14-5566</w:t></w:p></w:comment></w:comments>",
        "word/header1.xml": f"<w:hdr {NS}><w:p><w:t>ACME SDN BHD 201201234567</w:t></w:p></w:hdr>",
        "word/footnotes.xml": f"<w:footnotes {NS}><w:footnote><w:p><w:t>ahmad@acme.com</w:t></w:p></w:footnote></w:footnotes>",
    })
    extract, coverage, _, _ = parse_docx(data)
    assert "880101-14-5566" in extract
    assert "201201234567" in extract
    assert "ahmad@acme.com" in extract
    assert {"body", "comments", "headers", "footnotes"} <= set(coverage.read)


def test_docx_offset_map_points_back_at_the_source_node():
    # Task 12 applies masks to the ORIGINAL docx, so every extract character
    # must be traceable to the w:t node it came from.
    data = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>Ahmad </w:t><w:t>880101-14-5566</w:t></w:p></w:body></w:document>",
    })
    extract, _, _, nodes = parse_docx(data)
    hit = next(n for n in nodes if extract[n.extract_start:n.extract_start + n.length] == "880101-14-5566")
    assert hit.part == "word/document.xml"
    assert hit.node_index == 1


def test_docx_offset_map_covers_a_span_split_across_runs():
    # Word routinely splits one word across runs (spell-check, formatting), so
    # a single finding maps to SEVERAL nodes. Task 12 must handle that; this
    # test is what proves the map carries enough to do it.
    data = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>880101</w:t><w:t>-14-5566</w:t></w:p></w:body></w:document>",
    })
    extract, _, _, nodes = parse_docx(data)
    start = extract.index("880101-14-5566")
    touched = [n for n in nodes if n.extract_start < start + 14 and n.extract_start + n.length > start]
    assert len(touched) == 2


def test_docx_reports_images_as_not_read():
    data = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>hi</w:t></w:p></w:body></w:document>",
        "word/media/image1.png": "\x89PNG",
        "word/media/image2.png": "\x89PNG",
    })
    _, coverage, _, _ = parse_docx(data)
    assert coverage.not_read == ["2 embedded images (no OCR)"]


def test_pdf_without_a_text_layer_is_an_ERROR_not_a_clean_scan():
    # The single most dangerous output this feature can produce is
    # "0 characters, all clear" on a scanned payroll PDF.
    scanned = (FIX / "scanned_no_text.pdf").read_bytes()
    with pytest.raises(SafetyError) as e:
        parse_pdf(scanned)
    assert e.value.code == ErrorCode.NO_TEXT_LAYER


def test_pdf_that_is_damaged_fails_loudly():
    with pytest.raises(SafetyError) as e:
        parse_pdf((FIX / "truncated.pdf").read_bytes())
    assert e.value.code == ErrorCode.PARSE_FAILED
```

- [ ] **Step 2: Add the two missing PDF fixtures to the generator**

Append to `code/backend/tests/fixtures/make_fixtures.py`:

```python
def scanned_no_text() -> bytes:
    """A structurally valid 2-page PDF with no text operators at all."""
    from pypdf import PdfWriter
    w = PdfWriter()
    w.add_blank_page(width=595, height=842)
    w.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()
```

and add `(HERE / "scanned_no_text.pdf").write_bytes(scanned_no_text())` to `__main__`.

- [ ] **Step 3: Run and watch it fail**

```bash
cd code/backend && python tests/fixtures/make_fixtures.py && python -m pytest tests/test_parsers.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.parsers'`

- [ ] **Step 4: Implement `text.py`**

```python
from dataclasses import dataclass

from app import limits
from app.models import Coverage


@dataclass(frozen=True)
class NodeRef:
    """A run of extract characters, and where in the source it came from.

    Task 12 walks these to apply an accepted mask to the ORIGINAL file rather
    than to a text copy of it. DOCX populates them; TXT/CSV and PDF return an
    empty list (the extract IS the file, and PDF redacts by search).
    """
    part: str
    node_index: int
    extract_start: int
    length: int


ExtractResult = tuple[str, Coverage, list[str], list[NodeRef]]


def truncate(text: str) -> tuple[str, bool]:
    if len(text) <= limits.MAX_EXTRACT_CHARS:
        return text, False
    return text[: limits.MAX_EXTRACT_CHARS], True


def parse_text(filename: str, data: bytes) -> ExtractResult:
    warnings: list[str] = []
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        # Never fail a scan on an encoding: a mis-decoded byte is still text we
        # can search, and refusing would push the user to attach it unchecked.
        text = data.decode("utf-8", errors="replace")
        warnings.append(
            "Some characters could not be decoded (unknown text encoding) "
            "and were replaced."
        )

    if filename.lower().endswith(".csv"):
        rows = text.splitlines()
        if len(rows) > limits.MAX_CSV_ROWS:
            text = "\n".join(rows[: limits.MAX_CSV_ROWS])
            warnings.append(
                f"Only the first {limits.MAX_CSV_ROWS:,} rows were checked."
            )

    return text, Coverage(read=["file text"], not_read=[]), warnings, []
```

- [ ] **Step 5: Implement `docx.py`**

```python
"""DOCX text extraction over the OOXML parts directly.

🔴 Deliberately NOT python-docx. Its paragraph iterator walks the main body
only -- headers, footers, footnotes, endnotes and comments are invisible to
it. An NRIC in a Word comment would then be unseen by us and seen by the
provider: a silent fail-open in the exact shape doc 00 section 6 calls the
worst case for a compliance buyer.
"""
import io
import re
import zipfile
from xml.etree import ElementTree

from app.models import Coverage, ErrorCode
from app.safety import SafetyError

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# part-name pattern -> the label used in Coverage.read
PART_GROUPS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^word/document\.xml$"), "body"),
    (re.compile(r"^word/header\d*\.xml$"), "headers"),
    (re.compile(r"^word/footer\d*\.xml$"), "footers"),
    (re.compile(r"^word/footnotes\.xml$"), "footnotes"),
    (re.compile(r"^word/endnotes\.xml$"), "endnotes"),
    (re.compile(r"^word/comments\.xml$"), "comments"),
]

from app.parsers.text import ExtractResult, NodeRef


def _text_of(part_name: str, part: bytes, base: int) -> tuple[str, list[NodeRef]]:
    """Extract text AND record where each w:t node's characters landed.

    `node_index` counts w:t nodes in document order within this part -- the
    same order Task 12's rewriter walks them in. The two must agree, so both
    use `root.iter()` and neither filters.
    """
    try:
        root = ElementTree.fromstring(part)
    except ElementTree.ParseError:
        return "", []

    pieces: list[str] = []
    refs: list[NodeRef] = []
    cursor = base
    t_index = 0

    for node in root.iter():
        if node.tag == f"{W_NS}t":
            body = node.text or ""
            if body:
                refs.append(NodeRef(part_name, t_index, cursor, len(body)))
                pieces.append(body)
                cursor += len(body)
            t_index += 1
        elif node.tag == f"{W_NS}tab":
            pieces.append("\t")
            cursor += 1
        elif node.tag in (f"{W_NS}br", f"{W_NS}p"):
            pieces.append("\n")
            cursor += 1

    return "".join(pieces), refs


def parse_docx(data: bytes) -> ExtractResult:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise SafetyError(
            ErrorCode.PARSE_FAILED,
            "This Word file looks damaged and could not be opened. It has not "
            "been sent to the AI.",
        ) from exc

    names = archive.namelist()

    # An encrypted OOXML file is an OLE container, not a ZIP with word/ parts.
    if "word/document.xml" not in names:
        raise SafetyError(
            ErrorCode.PASSWORD_PROTECTED,
            "This Word file appears to be password-protected, so it could not "
            "be checked. It has not been sent to the AI. Please remove the "
            "password and try again.",
        )

    chunks: list[str] = []
    refs: list[NodeRef] = []
    read: list[str] = []
    cursor = 0

    for pattern, label in PART_GROUPS:
        matched = sorted(n for n in names if pattern.match(n))
        if not matched:
            continue
        read.append(label)
        for name in matched:
            body, part_refs = _text_of(name, archive.read(name), cursor)
            if not body.strip():
                continue
            chunks.append(body)
            refs.extend(part_refs)
            cursor += len(body) + 1     # +1 for the "\n" join below

    images = [n for n in names if n.startswith("word/media/")]
    # 🔴 Preserving images is NOT cleaning them. An NRIC inside a pasted
    # screenshot survives redaction untouched, and the review pane says so
    # (Pushback 3). OCR is backlog, not MVP.
    not_read = [f"{len(images)} embedded images (kept as-is, not checked — no OCR)"] if images else []

    return "\n".join(chunks), Coverage(read=read, not_read=not_read), [], refs
```

⚠️ **The `cursor` arithmetic and the `"\n".join` must agree exactly.** They are the same fact written twice, which is this package's most-corrected defect shape (CLAUDE.md §2). **`test_docx_offset_map_points_back_at_the_source_node` is the guard** — it asserts `extract[n.extract_start : n.extract_start + n.length]` equals the node's own text, which fails the moment the two drift.

- [ ] **Step 6: Implement `pdf.py`**

```python
import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app import limits
from app.models import Coverage, ErrorCode
from app.parsers.text import ExtractResult
from app.safety import SafetyError


def parse_pdf(data: bytes) -> ExtractResult:
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
    except (PdfReadError, ValueError, OSError) as exc:
        raise SafetyError(
            ErrorCode.PARSE_FAILED,
            "This PDF looks damaged and could not be opened. It has not been "
            "sent to the AI.",
        ) from exc

    if reader.is_encrypted:
        try:
            opened = reader.decrypt("")   # some PDFs are "encrypted" with an empty owner password
        except Exception:
            opened = 0
        if not opened:
            raise SafetyError(
                ErrorCode.PASSWORD_PROTECTED,
                "This PDF is password-protected, so it could not be checked. "
                "It has not been sent to the AI.",
            )

    pages = reader.pages
    warnings: list[str] = []
    if len(pages) > limits.MAX_PDF_PAGES:
        warnings.append(
            f"Only the first {limits.MAX_PDF_PAGES} pages were checked "
            f"(this PDF has {len(pages)})."
        )
        pages = pages[: limits.MAX_PDF_PAGES]

    texts: list[str] = []
    with_text = 0
    for page in pages:
        try:
            body = page.extract_text() or ""
        except Exception:                    # one bad page must not fail the file
            body = ""
        if len(body.strip()) >= limits.MIN_CHARS_PER_PAGE:
            with_text += 1
        texts.append(body)

    # 🔴 Pushback 3. Zero characters with a CLEAN verdict on a scanned payroll
    # PDF is the most dangerous output this feature can produce. Low yield is
    # an ERROR the user is told about -- never a quiet pass.
    if with_text == 0:
        raise SafetyError(
            ErrorCode.NO_TEXT_LAYER,
            "This PDF looks like a scan or photos rather than text, so "
            "Vanguard could not read it. It has not been sent to the AI. "
            "Reading scanned documents is not supported yet.",
        )
    if with_text < len(pages):
        warnings.append(
            f"{len(pages) - with_text} of {len(pages)} pages had no readable "
            "text (likely scans) and were not checked."
        )

    coverage = Coverage(
        read=["text layer"],
        not_read=(
            [f"{len(pages) - with_text} pages with no text layer (no OCR)"]
            if with_text < len(pages)
            else []
        ),
        pages_total=len(reader.pages),
        pages_with_text=with_text,
    )
    return "\n".join(texts), coverage, warnings, []
```

- [ ] **Step 7: Run the tests**

```bash
cd code/backend && python -m pytest tests/test_parsers.py -v
```
Expected: 10 passed.

- [ ] **Step 8: Commit**

```bash
git add code/backend
git commit -m "feat(backend): txt/csv, docx (all OOXML parts), pdf text-layer parsers with coverage reporting"
```

---

### Task 5: The `/v1/extract` endpoint, and the zero-retention rules that hold F4 up

**Files:**
- Create: `code/backend/app/routes/__init__.py`, `code/backend/app/routes/extract.py`
- Create: `code/backend/app/main.py`
- Test: `code/backend/tests/test_extract_route.py`
- Test: `code/backend/tests/test_zero_retention.py`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces: `POST /v1/extract` (multipart, field name `file`) → `ExtractResponse` | `ErrorResponse`; and `GET /healthz` → `{"ok": true}`.

🔴 **F4 is defended here or nowhere.** Doc 02 §4.3 names four ways zero-retention silently becomes short-retention, and **one of them is on by default in this exact stack**: Starlette's `UploadFile` is a `SpooledTemporaryFile` with a 1 MB rollover, so **every file over 1 MB is written to disk before our code sees it.** Reading the raw body under a hard cap avoids the spool entirely.

- [ ] **Step 1: Write the failing route tests**

```python
import io
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIX = Path(__file__).parent / "fixtures"
NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def _post(name: str, data: bytes, content_type: str = "application/octet-stream"):
    return client.post("/v1/extract", files={"file": (name, data, content_type)})


def test_txt_round_trip():
    r = _post("notes.txt", b"Ahmad 880101-14-5566")
    assert r.status_code == 200
    body = r.json()
    assert body["format"] == "txt"
    assert "880101-14-5566" in body["extract"]
    assert body["truncated"] is False


def test_oversized_upload_is_rejected_with_a_human_message():
    r = _post("big.txt", b"x" * (11 * 1024 * 1024))
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "too_large"
    assert "10 MB" in r.json()["error"]["message"]


def test_unsupported_type_is_415_and_names_what_is_supported():
    r = _post("photo.jpg", b"\xff\xd8\xff\xe0blah")
    assert r.status_code == 415
    assert r.json()["error"]["code"] == "unsupported_type"


def test_zip_bomb_is_refused_before_decompression():
    r = _post("bomb.docx", (FIX / "zip_bomb.docx").read_bytes())
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "suspicious_archive"


def test_scanned_pdf_is_an_error_not_a_clean_extract():
    r = _post("scan.pdf", (FIX / "scanned_no_text.pdf").read_bytes())
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "no_text_layer"


def test_truncation_is_reported_rather_than_silent():
    r = _post("big.txt", b"a" * 150_000)
    assert r.status_code == 200
    assert r.json()["truncated"] is True
    assert r.json()["chars"] == 100_000


def test_docx_comment_text_reaches_the_extract():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", f"<w:document {NS}><w:body><w:p><w:t>clean</w:t></w:p></w:body></w:document>")
        z.writestr("word/comments.xml", f"<w:comments {NS}><w:comment><w:p><w:t>880101-14-5566</w:t></w:p></w:comment></w:comments>")
    r = _post("memo.docx", buf.getvalue())
    assert r.status_code == 200
    assert "880101-14-5566" in r.json()["extract"]


def test_healthz():
    assert client.get("/healthz").json() == {"ok": True}
```

- [ ] **Step 2: Write the failing zero-retention tests**

```python
"""F4 regression tests.

Doc 02 section 4.3: "Zero-retention is not an architecture decision you make
once. It's a property you defend against your own future engineers' good
ideas." These tests are that defence, in executable form.
"""
import logging
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
SECRET = b"Ahmad bin Ali 880101-14-5566"


def test_no_temp_file_survives_a_request():
    tmp = Path(tempfile.gettempdir())
    before = set(tmp.iterdir())
    client.post("/v1/extract", files={"file": ("notes.txt", SECRET, "text/plain")})
    after = set(tmp.iterdir())
    assert after - before == set(), f"request left temp files behind: {after - before}"


def test_no_file_content_reaches_the_logs(caplog):
    with caplog.at_level(logging.DEBUG):
        client.post("/v1/extract", files={"file": ("notes.txt", SECRET, "text/plain")})
    joined = "\n".join(r.getMessage() for r in caplog.records)
    assert "880101-14-5566" not in joined
    assert "Ahmad" not in joined


def test_a_parse_failure_does_not_log_the_body(caplog):
    with caplog.at_level(logging.DEBUG):
        client.post("/v1/extract", files={"file": ("x.pdf", b"%PDF-1.7 " + SECRET, "application/pdf")})
    joined = "\n".join(r.getMessage() for r in caplog.records)
    assert "880101-14-5566" not in joined


def test_the_app_declares_no_retry_or_queue_dependency():
    # A structural guard: doc 02 section 4.3 names async retry and dead-letter
    # queues as the mechanisms that silently turn zero-retention into
    # short-retention. If someone adds one, this test is where they notice.
    import app.main as main_module
    source = Path(main_module.__file__).read_text()
    for banned in ("celery", "rq.Queue", "boto3", "kafka", "retry_queue"):
        assert banned not in source, f"{banned} introduces a persistence path; see doc 02 section 4.3"
```

- [ ] **Step 3: Run both and watch them fail**

```bash
cd code/backend && python -m pytest tests/test_extract_route.py tests/test_zero_retention.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 4: Implement the route**

```python
import hashlib
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app import limits
from app.models import Coverage, ErrorCode, ErrorResponse, ExtractResponse
from app.parsers.docx import parse_docx
from app.parsers.pdf import parse_pdf
from app.parsers.text import parse_text, truncate
from app.safety import SafetyError, guard_zip, run_with_timeout, sniff_format

log = logging.getLogger("vanguard")
router = APIRouter()

_STATUS = {
    ErrorCode.TOO_LARGE: 413,
    ErrorCode.UNSUPPORTED_TYPE: 415,
    ErrorCode.PASSWORD_PROTECTED: 422,
    ErrorCode.NO_TEXT_LAYER: 422,
    ErrorCode.PARSE_FAILED: 422,
    ErrorCode.SUSPICIOUS_ARCHIVE: 422,
    ErrorCode.TIMEOUT: 504,
    ErrorCode.EXTRACT_MISMATCH: 409,
    ErrorCode.REDACTION_FAILED: 422,
}


def _fail(err: SafetyError) -> JSONResponse:
    # Log the CODE and the SIZE. Never the name, never the bytes, never the
    # extract. I3: classes and counts, never values.
    log.info("extract rejected code=%s", err.code.value)
    return JSONResponse(
        status_code=_STATUS[err.code],
        content=ErrorResponse.of(err.code, err.message).model_dump(mode="json"),
    )


@router.post("/v1/extract")
async def extract(request: Request) -> JSONResponse:
    """Parse a file to text. Return the text. Keep nothing.

    🔴 The body is read manually rather than via `UploadFile` on purpose.
    Starlette's UploadFile is a SpooledTemporaryFile with a 1 MB rollover, so
    every file over 1 MB would be written to DISK before our code ran -- F4
    broken by a framework default, which is doc 02 section 4.3's exact
    failure mode and CLAUDE.md's "defaults are where the trap lives".
    """
    filename = request.headers.get("x-vanguard-filename", "upload")

    declared = request.headers.get("content-length")
    if declared and int(declared) > limits.MAX_UPLOAD_BYTES:
        return _fail(SafetyError(
            ErrorCode.TOO_LARGE,
            f"This file is {int(declared) / 1024 / 1024:.0f} MB. The limit is 10 MB, "
            "so it was not checked and has not been sent to the AI.",
        ))

    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > limits.MAX_UPLOAD_BYTES + 4096:   # slack for multipart framing
            return _fail(SafetyError(
                ErrorCode.TOO_LARGE,
                "This file is larger than the 10 MB limit, so it was not checked "
                "and has not been sent to the AI.",
            ))

    body, parsed_name = _split_multipart(bytes(data))
    if parsed_name:
        filename = parsed_name

    try:
        kind = sniff_format(filename, body)
        if kind == "docx":
            guard_zip(body)
            text, coverage, warnings, _nodes = run_with_timeout(
                parse_docx, body, limits.PARSE_TIMEOUT_SECONDS
            )
        elif kind == "pdf":
            text, coverage, warnings, _nodes = run_with_timeout(
                parse_pdf, body, limits.PARSE_TIMEOUT_SECONDS
            )
        else:
            text, coverage, warnings, _nodes = parse_text(filename, body)
    except SafetyError as err:
        return _fail(err)
    finally:
        # Explicit, and load-bearing as documentation even though CPython
        # would collect these anyway: nothing here is handed onward.
        data.clear()

    text, was_truncated = truncate(text)
    if was_truncated:
        warnings.append(
            f"Only the first {limits.MAX_EXTRACT_CHARS:,} characters were checked."
        )

    log.info("extract ok format=%s chars=%d truncated=%s", kind, len(text), was_truncated)
    return JSONResponse(
        status_code=200,
        content=ExtractResponse(
            extract=text,
            # Bound to the exact text the user is about to review. /v1/redact
            # recomputes it and refuses on mismatch (Task 5B).
            extract_sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
            chars=len(text),
            truncated=was_truncated,
            format="csv" if kind == "csv" else kind,
            coverage=coverage if isinstance(coverage, Coverage) else Coverage(**coverage),
            warnings=warnings,
        ).model_dump(mode="json"),
    )


def _split_multipart(raw: bytes) -> tuple[bytes, str | None]:
    """Minimal multipart/form-data extraction of the single `file` part.

    A full parser is not needed for a one-field form, and avoiding
    python-multipart's UploadFile keeps the spool-to-disk path closed.
    """
    if not raw.startswith(b"--"):
        return raw, None
    boundary = raw.split(b"\r\n", 1)[0]
    parts = raw.split(boundary)
    for part in parts:
        head, _, tail = part.partition(b"\r\n\r\n")
        if b'name="file"' not in head:
            continue
        name = None
        marker = b'filename="'
        if marker in head:
            start = head.index(marker) + len(marker)
            name = head[start : head.index(b'"', start)].decode("utf-8", "replace")
        return tail.rstrip(b"\r\n-"), name
    return raw, None
```

- [ ] **Step 5: Implement `main.py`**

```python
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.extract import router

# Body-capturing APM is doc 02 section 4.3's fourth named trap ("nobody
# notices for six months"). There is no APM here, and this module is the
# place a reviewer looks to confirm that.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title="Vanguard file extract", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://chatgpt.com", "https://claude.ai"],
    allow_methods=["POST", "GET"],
    allow_headers=["content-type", "x-vanguard-filename"],
)

app.include_router(router)


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}
```

- [ ] **Step 6: Run the tests**

```bash
cd code/backend && python -m pytest -v
```
Expected: all tests pass across `test_models.py`, `test_safety.py`, `test_parsers.py`, `test_extract_route.py`, `test_zero_retention.py`.

- [ ] **Step 7: Run the server with access logging off for bodies and confirm by hand**

```bash
cd code/backend && uvicorn app.main:app --port 8000 --no-access-log
curl -s -F "file=@tests/fixtures/scanned_no_text.pdf" http://localhost:8000/v1/extract | head -c 400
```
Expected: `{"error":{"code":"no_text_layer","message":"This PDF looks like a scan …`

- [ ] **Step 8: Commit**

```bash
git add code/backend
git commit -m "feat(backend): POST /v1/extract with F4 zero-retention regression tests"
```

---

### Task 5B: `POST /v1/redact` — apply masks in the original format

🔴 **This is the founder's 2026-07-18 amendment and it is the reason the extract is a decision surface rather than an output.** A masked DOCX comes back a DOCX with `word/media/` intact; a masked PDF comes back a PDF with its image XObjects intact. **We never convert text back into a document.** We apply the accepted masks *onto the original bytes*.

**Files:**
- Create: `code/backend/app/redact/__init__.py`, `docx.py`, `pdf.py`
- Modify: `code/backend/app/routes/extract.py` (add the route)
- Test: `code/backend/tests/test_redact.py`

**Interfaces:**
- Consumes: `RedactRequest`, `RedactSpan`, `NodeRef`, the Task 4 parsers, Task 1B's verdict.
- Produces: `POST /v1/redact` (multipart: `file` + `spec` JSON) → `application/octet-stream` with `X-Vanguard-Redacted-Name`; `redact_docx(data, spans, nodes) -> bytes`; `redact_pdf(data, spans) -> bytes`.

⚠️ **Gate: do not build `redact/pdf.py` until Task 1B (U30) has PASSED and its licensing line is answered.** If U30 failed, this task ships DOCX only and the PDF branch returns the founder-chosen fallback.

- [ ] **Step 1: Write the failing redact tests**

```python
import io
import json
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
FIX = Path(__file__).parent / "fixtures"


def _docx(parts: dict[str, str | bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, body in parts.items():
            z.writestr(name, body)
    return buf.getvalue()


def _extract(name: str, data: bytes) -> dict:
    return client.post("/v1/extract", files={"file": (name, data, "application/octet-stream")}).json()


def _redact(name: str, data: bytes, spec: dict):
    return client.post(
        "/v1/redact",
        files={"file": (name, data, "application/octet-stream")},
        data={"spec": json.dumps(spec)},
    )


def test_a_masked_docx_comes_back_as_a_docx_with_its_images():
    src = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>Ahmad 880101-14-5566</w:t></w:p></w:body></w:document>",
        "word/media/image1.png": b"\x89PNG-not-really",
    })
    got = _extract("memo.docx", src)
    start = got["extract"].index("880101-14-5566")

    r = _redact("memo.docx", src, {
        "extract_sha256": got["extract_sha256"],
        "spans": [{"start": start, "end": start + 14, "text": "880101-14-5566", "placeholder": "NRIC_1"}],
    })
    assert r.status_code == 200
    assert r.headers["x-vanguard-redacted-name"] == "memo.redacted.docx"

    out = zipfile.ZipFile(io.BytesIO(r.content))
    body = out.read("word/document.xml").decode()
    assert "880101-14-5566" not in body
    assert "NRIC_1" in body
    assert out.read("word/media/image1.png") == b"\x89PNG-not-really"


def test_a_span_split_across_runs_is_fully_removed():
    src = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>880101</w:t><w:t>-14-5566</w:t></w:p></w:body></w:document>",
    })
    got = _extract("split.docx", src)
    start = got["extract"].index("880101-14-5566")
    r = _redact("split.docx", src, {
        "extract_sha256": got["extract_sha256"],
        "spans": [{"start": start, "end": start + 14, "text": "880101-14-5566", "placeholder": "NRIC_1"}],
    })
    body = zipfile.ZipFile(io.BytesIO(r.content)).read("word/document.xml").decode()
    assert "880101" not in body
    assert "-14-5566" not in body
    assert body.count("NRIC_1") == 1


def test_a_stale_extract_hash_is_REFUSED_rather_than_best_efforted():
    # Offsets reviewed against one parse must never be applied against
    # another. A near-miss redaction is worse than none: it produces a file we
    # tell the user is masked and is not.
    src = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>Ahmad 880101-14-5566</w:t></w:p></w:body></w:document>",
    })
    r = _redact("memo.docx", src, {
        "extract_sha256": "0" * 64,
        "spans": [{"start": 6, "end": 20, "text": "880101-14-5566", "placeholder": "NRIC_1"}],
    })
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "extract_mismatch"


def test_a_span_that_cannot_be_located_fails_LOUDLY():
    src = _docx({
        "word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>nothing sensitive</w:t></w:p></w:body></w:document>",
    })
    got = _extract("memo.docx", src)
    r = _redact("memo.docx", src, {
        "extract_sha256": got["extract_sha256"],
        "spans": [{"start": 0, "end": 5, "text": "ABSENT", "placeholder": "NRIC_1"}],
    })
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "redaction_failed"


def test_csv_redaction_returns_text():
    src = b"name,ic\nAhmad,880101-14-5566\n"
    got = _extract("staff.csv", src)
    start = got["extract"].index("880101-14-5566")
    r = _redact("staff.csv", src, {
        "extract_sha256": got["extract_sha256"],
        "spans": [{"start": start, "end": start + 14, "text": "880101-14-5566", "placeholder": "NRIC_1"}],
    })
    assert r.status_code == 200
    assert r.headers["x-vanguard-redacted-name"] == "staff.redacted.csv"
    assert b"880101-14-5566" not in r.content
    assert b"NRIC_1" in r.content


def test_redact_keeps_nothing(tmp_path):
    import tempfile
    before = set(Path(tempfile.gettempdir()).iterdir())
    src = _docx({"word/document.xml": f"<w:document {NS}><w:body><w:p><w:t>Ahmad</w:t></w:p></w:body></w:document>"})
    got = _extract("m.docx", src)
    _redact("m.docx", src, {"extract_sha256": got["extract_sha256"], "spans": []})
    assert set(Path(tempfile.gettempdir()).iterdir()) - before == set()
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd code/backend && python -m pytest tests/test_redact.py -v
```
Expected: 404 on `/v1/redact` for every test.

- [ ] **Step 3: Implement `redact/docx.py`**

```python
"""Apply accepted masks to the ORIGINAL DOCX.

The extract's NodeRef map says which w:t node each extract character came
from, so a span becomes a set of (node, local range) edits. Everything not
edited -- styles, tables, headers, and every byte under word/media/ -- is
copied through untouched.
"""
import io
import zipfile
from xml.etree import ElementTree

from app.models import ErrorCode, RedactSpan
from app.parsers.text import NodeRef
from app.safety import SafetyError

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
ElementTree.register_namespace(
    "w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
)


def redact_docx(data: bytes, spans: list[RedactSpan], nodes: list[NodeRef]) -> bytes:
    # part -> node_index -> list of (local_start, local_end, replacement)
    edits: dict[str, dict[int, list[tuple[int, int, str]]]] = {}

    for span in spans:
        touched = [
            n for n in nodes
            if n.extract_start < span.end and n.extract_start + n.length > span.start
        ]
        if not touched:
            # 🔴 Loud, not quiet. A span we cannot place is a span we cannot
            # remove, and returning the file anyway hands the user a document
            # we have told them is masked.
            raise SafetyError(
                ErrorCode.REDACTION_FAILED,
                f'Vanguard could not apply the mask for "{span.text}" to this document, '
                "so nothing was changed and the file has not been sent to the AI.",
            )

        # The placeholder goes in the FIRST node touched; the remainder of the
        # span is deleted from the rest. A span split across runs therefore
        # yields exactly one placeholder, never one per run.
        for position, node in enumerate(touched):
            local_start = max(0, span.start - node.extract_start)
            local_end = min(node.length, span.end - node.extract_start)
            replacement = span.placeholder if position == 0 else ""
            edits.setdefault(node.part, {}).setdefault(node.node_index, []).append(
                (local_start, local_end, replacement)
            )

    source = zipfile.ZipFile(io.BytesIO(data))
    out_buffer = io.BytesIO()

    with zipfile.ZipFile(out_buffer, "w", zipfile.ZIP_DEFLATED) as out:
        for item in source.infolist():
            payload = source.read(item.filename)
            if item.filename in edits:
                payload = _rewrite_part(payload, edits[item.filename])
            out.writestr(item, payload)

    return out_buffer.getvalue()


def _rewrite_part(part: bytes, by_node: dict[int, list[tuple[int, int, str]]]) -> bytes:
    root = ElementTree.fromstring(part)
    t_index = 0
    for node in root.iter():
        if node.tag != f"{W_NS}t":
            continue
        ranges = by_node.get(t_index)
        if ranges and node.text:
            text = node.text
            # Right to left so earlier offsets stay valid.
            for local_start, local_end, replacement in sorted(ranges, reverse=True):
                text = text[:local_start] + replacement + text[local_end:]
            node.text = text
            # Word collapses leading/trailing space unless told not to; a
            # placeholder can leave one behind.
            node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t_index += 1
    return ElementTree.tostring(root, encoding="UTF-8", xml_declaration=True)
```

- [ ] **Step 4: Implement `redact/pdf.py` — only if U30 passed**

```python
"""In-place PDF text redaction, images preserved. Gated on U30 (Task 1B).

🔴 Two disclosed behaviours the review UI must not contradict:
  1. Redaction is by STRING SEARCH, so every occurrence of an accepted span is
     removed, not only the one the user hovered. Over-redaction is the
     fail-safe direction, but it IS a semantic difference.
  2. Text inside images is untouched. Keeping images is not cleaning them.
"""
import io

import fitz  # PyMuPDF -- licence position recorded in the U30 spike README

from app.models import ErrorCode, RedactSpan
from app.safety import SafetyError


def redact_pdf(data: bytes, spans: list[RedactSpan]) -> bytes:
    doc = fitz.open(stream=data, filetype="pdf")
    located = {span.text: 0 for span in spans}

    for page in doc:
        for span in spans:
            for rect in page.search_for(span.text):
                page.add_redact_annot(rect, text=span.placeholder, fill=(1, 1, 1))
                located[span.text] += 1
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

    missing = [text for text, count in located.items() if count == 0]
    if missing:
        raise SafetyError(
            ErrorCode.REDACTION_FAILED,
            f"Vanguard could not apply {len(missing)} of the masks to this PDF, so "
            "nothing was changed and the file has not been sent to the AI.",
        )

    out = io.BytesIO()
    doc.save(out, garbage=3, deflate=True)
    payload = out.getvalue()

    # Verify rather than trust: U30's fatal failure mode is a span that was
    # located, redacted, and survived anyway.
    residual = "\n".join(page.get_text() for page in fitz.open(stream=payload, filetype="pdf"))
    still_there = [span.text for span in spans if span.text in residual]
    if still_there:
        raise SafetyError(
            ErrorCode.REDACTION_FAILED,
            "Vanguard could not fully remove the selected text from this PDF, so "
            "nothing was changed and the file has not been sent to the AI.",
        )

    return payload
```

🔴 **The re-read verification is not belt-and-braces, it is the whole point.** Ledger #11's lesson is that a correct instrument can still produce a wrong measurement when its input is not what you assumed. **Here the mechanism reports success and the text can still be in the file.** Checking the output rather than the return code is the only honest confirmation.

- [ ] **Step 5: Add the route to `routes/extract.py`**

```python
@router.post("/v1/redact")
async def redact(request: Request) -> Response:
    """Apply accepted masks to the original file, in its original format."""
    body, filename, spec_raw = await _read_multipart_with_spec(request)
    try:
        spec = RedactRequest.model_validate_json(spec_raw)
    except ValidationError:
        return _fail(SafetyError(ErrorCode.PARSE_FAILED, "The redaction request was malformed."))

    try:
        kind = sniff_format(filename, body)
        if kind == "docx":
            guard_zip(body)
            text, _, _, nodes = run_with_timeout(parse_docx, body, limits.PARSE_TIMEOUT_SECONDS)
        elif kind == "pdf":
            text, _, _, nodes = run_with_timeout(parse_pdf, body, limits.PARSE_TIMEOUT_SECONDS)
        else:
            text, _, _, nodes = parse_text(filename, body)
        text, _ = truncate(text)

        # 🔴 The reviewed extract and the one we are about to edit must be the
        # SAME text. If the parse is not reproducible, the offsets are
        # meaningless and a "best effort" redaction is a file we would wrongly
        # call clean.
        if hashlib.sha256(text.encode("utf-8")).hexdigest() != spec.extract_sha256:
            raise SafetyError(
                ErrorCode.EXTRACT_MISMATCH,
                "This file changed between checking and sending, so it was not "
                "redacted and has not been sent to the AI. Please attach it again.",
            )

        stem, _, suffix = filename.rpartition(".")
        if kind == "docx":
            payload = redact_docx(body, spec.spans, nodes)
            media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif kind == "pdf":
            payload = redact_pdf(body, spec.spans)
            media = "application/pdf"
        else:
            payload = _apply_to_text(text, spec.spans).encode("utf-8")
            media = "text/csv" if kind == "csv" else "text/plain"
        out_name = f"{stem or filename}.redacted.{suffix or 'txt'}"
    except SafetyError as err:
        return _fail(err)

    log.info("redact ok format=%s spans=%d", kind, len(spec.spans))
    return Response(
        content=payload,
        media_type=media,
        headers={"x-vanguard-redacted-name": out_name},
    )


def _apply_to_text(text: str, spans: list[RedactSpan]) -> str:
    for span in sorted(spans, key=lambda s: s.start, reverse=True):
        text = text[: span.start] + span.placeholder + text[span.end :]
    return text
```

Add `Response`, `ValidationError`, `RedactRequest`, `RedactSpan`, `truncate`, `redact_docx`, `redact_pdf` to the imports, plus `_read_multipart_with_spec` — the same minimal parser as `_split_multipart` but returning the `spec` field alongside `file`.

Also add to `app/main.py`'s CORS: `expose_headers=["x-vanguard-redacted-name"]` — **without it the extension cannot read the filename**, and a cross-origin response header is invisible by default. *(A default nobody remembers making — CLAUDE.md's own phrase for where this trap lives.)*

- [ ] **Step 6: Run the tests**

```bash
cd code/backend && python -m pytest -v
```
Expected: all pass, including the six redact tests.

- [ ] **Step 7: Commit**

```bash
git add code/backend
git commit -m "feat(backend): POST /v1/redact - format-preserving DOCX and PDF masking with hash-verified offsets"
```

---

### Task 6: Docker Compose and the backend README the team actually follows

**Files:**
- Create: `code/backend/Dockerfile`, `code/backend/docker-compose.yml`, `code/backend/.dockerignore`
- Modify: `code/backend/README.md`

**Interfaces:**
- Consumes: Task 5's app.
- Produces: `http://localhost:8000` for the extension's default config in Task 10.

🔴 **LOCKED (founder, 2026-07-18): a founder-hosted shared API is the PRIMARY path; `docker compose up` is the documented fallback.** *"Clone → Load unpacked"* was Slice 1's whole acceptance property, and *"clone → install Python → install Docker → load unpacked"* loses testers. The Options page (Task 9) makes the base URL configurable so a tester can switch between the two without a rebuild.

🔴 **Tell the testers plainly, in the README and in the team message, and do not soften it:** on the shared instance **their real work files leave their machine and are parsed on a server the founder runs.** That **is** the product's posture (ADR 0008 — files go to the cloud, in-region, zero-retention, under DPA), but the team is not a customer with a DPA, and *"we scanned your files on my server"* discovered afterwards is a different conversation from the same fact said upfront. **The prompt text still never leaves the machine** and that distinction is the sentence worth giving them: *"your typing stays local; the file goes to the checker and is not kept."*

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir "fastapi>=0.115" "uvicorn[standard]>=0.30" \
    "python-multipart>=0.0.9" "pypdf>=5.0"

COPY app ./app

# No volume mounts for uploads. Nothing is written to this filesystem by the
# request path, and there is nowhere for it to persist if it were (F4).
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
```

- [ ] **Step 2: Write the compose file**

```yaml
services:
  extract:
    build: .
    ports:
      - "8000:8000"
    read_only: true                 # F4, enforced by the runtime rather than by intent
    tmpfs:
      - /tmp:size=16m
    mem_limit: 512m                 # a parse bomb that slips the guards still cannot take the host
    restart: "no"                   # no restart-loop that could retry a queued payload
```

- [ ] **Step 3: Verify it runs and refuses a bomb**

```bash
cd code/backend && docker compose up --build -d
curl -s http://localhost:8000/healthz
curl -s -F "file=@tests/fixtures/zip_bomb.docx" http://localhost:8000/v1/extract
docker compose down
```
Expected: `{"ok":true}` then `{"error":{"code":"suspicious_archive",…}}`

- [ ] **Step 4: Rewrite `code/backend/README.md`**

Keep the existing "Why Python" and "Standing constraints" sections verbatim — they are still correct and still cited. **Add** a `## Running it (Slice 2 team test)` section stating the **founder-hosted instance as the default** with its address and the Options-page instruction, then `docker compose up` as the fallback with the two commands above; a `## What testers should know` section carrying the plain-language paragraph from the note above; a `## What this service does not keep` section listing the four doc 02 §4.3 traps and the line of code or test that closes each; and a `## Residency` line: **`ap-southeast-5` is the commercial target for MY tenants (doc 02 §6.2, U13 ✅); the Slice 2 team test runs on localhost or one founder-hosted instance and does not exercise the residency path. U17 is still unverified and still gates Phase 1 sizing.**

- [ ] **Step 5: Commit**

```bash
git add code/backend
git commit -m "feat(backend): dockerised extract service and team-test run instructions"
```

---

### Task 7: Extension file types and the in-memory store

**Files:**
- Create: `code/extension/src/files/types.ts`, `code/extension/src/files/store.ts`
- Test: `code/extension/tests/files/store.test.ts`

**Interfaces:**
- Consumes: `Finding` from `src/detection/l1/types`, `SpanDecisionMap` from `src/ui/send-review-logic`.
- Produces: `HeldFile`, `FileStatus`, `Coverage`, `ApiError`, and a `FileStore` class with `add / get / list / update / remove / clear / allResolved`.

- [ ] **Step 1: Write the failing store test**

```ts
import { describe, expect, it } from 'vitest';
import { FileStore } from '../../src/files/store';

const f = (name: string) => new File(['hello'], name, { type: 'text/plain' });

describe('FileStore', () => {
  it('assigns a stable id and starts held', () => {
    const s = new FileStore();
    const id = s.add(f('a.txt'));
    expect(s.get(id)!.status.kind).toBe('held');
    expect(s.get(id)!.file.name).toBe('a.txt');
  });

  it('is not resolved while a file is still scanning', () => {
    const s = new FileStore();
    const id = s.add(f('a.txt'));
    s.update(id, { status: { kind: 'scanning' } });
    expect(s.allResolved()).toBe(false);
  });

  it('is resolved when a scanned file has no findings', () => {
    const s = new FileStore();
    const id = s.add(f('a.txt'));
    s.update(id, {
      status: { kind: 'scanned' },
      extract: 'nothing here',
      findings: [],
      decisions: new Map(),
    });
    expect(s.allResolved()).toBe(true);
  });

  it('is not resolved while a finding is pending', () => {
    const s = new FileStore();
    const id = s.add(f('a.txt'));
    s.update(id, {
      status: { kind: 'scanned' },
      extract: 'x 880101-14-5566',
      findings: [{ cls: 'NRIC', start: 2, end: 16, text: '880101-14-5566' }],
      decisions: new Map([['NRIC:2:16:880101-14-5566', { kind: 'pending' }]]),
    });
    expect(s.allResolved()).toBe(false);
  });

  it('is NOT resolved on an error until the user acknowledges it', () => {
    // ADR 0014: never fail-closed -- but never fail SILENTLY either. An
    // unreadable file must be surfaced and consciously escaped, not skipped.
    const s = new FileStore();
    const id = s.add(f('a.pdf'));
    s.update(id, { status: { kind: 'error', code: 'no_text_layer', message: 'scanned' } });
    expect(s.allResolved()).toBe(false);
    s.update(id, { status: { kind: 'error_acknowledged', code: 'no_text_layer', message: 'scanned', reason: 'internal doc, reviewed by me' } });
    expect(s.allResolved()).toBe(true);
  });

  it('holds nothing after clear -- the store never outlives the tab', () => {
    const s = new FileStore();
    s.add(f('a.txt'));
    s.clear();
    expect(s.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd code/extension && npx vitest run tests/files/store.test.ts
```
Expected: `Failed to resolve import "../../src/files/store"`

- [ ] **Step 3: Write `types.ts`**

```ts
import type { Finding } from '../detection/l1/types';
import type { SpanDecisionMap } from '../ui/send-review-logic';

export type ApiErrorCode =
  | 'too_large'
  | 'unsupported_type'
  | 'password_protected'
  | 'no_text_layer'
  | 'parse_failed'
  | 'timeout'
  | 'suspicious_archive'
  | 'extract_mismatch'
  | 'redaction_failed'
  | 'network';

export type Coverage = {
  read: string[];
  /** 🔴 What we did NOT read. Rendered in the File pane: a clean extract is
   *  not a clean file, and the user must be able to see that boundary. */
  not_read: string[];
  pages_total: number | null;
  pages_with_text: number | null;
};

export type FileStatus =
  | { kind: 'held' }
  | { kind: 'extracting' }
  | { kind: 'scanning' }
  | { kind: 'scanned' }
  | { kind: 'error'; code: ApiErrorCode; message: string }
  | { kind: 'error_acknowledged'; code: ApiErrorCode; message: string; reason: string };

export type HeldFile = {
  id: string;
  file: File;
  status: FileStatus;
  extract?: string;
  extractSha256?: string;
  truncated?: boolean;
  coverage?: Coverage;
  warnings?: string[];
  findings?: Finding[];
  decisions?: SpanDecisionMap;
};

export type ExtractResponse = {
  extract: string;
  /** Sent back on /v1/redact so the backend can prove it is editing the same
   *  text the user reviewed. */
  extract_sha256: string;
  chars: number;
  truncated: boolean;
  format: 'txt' | 'csv' | 'docx' | 'pdf';
  coverage: Coverage;
  warnings: string[];
};
```

- [ ] **Step 4: Write `store.ts`**

```ts
import { allResolved as spansResolved } from '../ui/send-review-logic';
import type { HeldFile } from './types';

/**
 * In-memory only, by design.
 *
 * Nothing here is written to chrome.storage or IndexedDB: the bytes and the
 * extract are the most sensitive objects the extension ever touches, and the
 * E2 reasoning applies unchanged -- a persisted readable copy is a second
 * place the value we spent the latency budget protecting can be recovered
 * from. The store dies with the tab.
 */
export class FileStore {
  private items = new Map<string, HeldFile>();
  private seq = 0;
  private listeners = new Set<() => void>();

  add(file: File): string {
    const id = `f${++this.seq}`;
    this.items.set(id, { id, file, status: { kind: 'held' } });
    this.emit();
    return id;
  }

  get(id: string): HeldFile | undefined {
    return this.items.get(id);
  }

  list(): HeldFile[] {
    return [...this.items.values()];
  }

  update(id: string, patch: Partial<Omit<HeldFile, 'id' | 'file'>>): void {
    const cur = this.items.get(id);
    if (!cur) return;
    this.items.set(id, { ...cur, ...patch });
    this.emit();
  }

  remove(id: string): void {
    this.items.delete(id);
    this.emit();
  }

  clear(): void {
    this.items.clear();
    this.emit();
  }

  /** True when every held file is safe to send. Gate consults this. */
  allResolved(): boolean {
    for (const item of this.items.values()) {
      switch (item.status.kind) {
        case 'held':
        case 'extracting':
        case 'scanning':
        case 'error':
          return false;
        case 'error_acknowledged':
          continue;
        case 'scanned':
          if (!spansResolved(item.decisions ?? new Map())) return false;
          continue;
      }
    }
    return true;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
```

- [ ] **Step 5: Run the tests**

```bash
cd code/extension && npx vitest run tests/files/store.test.ts
```
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add code/extension/src/files code/extension/tests/files
git commit -m "feat(ext): in-memory held-file store for Slice 2"
```

---

### Task 8: The attach interceptor and the re-attach path

**Files:**
- Create: `code/extension/src/files/capture.ts`, `code/extension/src/files/attach.ts`
- Modify: `code/extension/src/adapters/types.ts`, `chatgpt.ts`, `claude.ts`
- Test: `code/extension/tests/files/capture.test.ts`, `code/extension/tests/files/attach.test.ts`

**Interfaces:**
- Consumes: Task 1's verified mechanism; `SurfaceAdapter`.
- Produces: `installFileCapture({ onFiles }): () => void` and `attachFiles(input, files): boolean`.

- [ ] **Step 1: Extend the adapter interface**

```ts
export type SurfaceAdapter = {
  host: string;
  getComposer(): HTMLElement | null;
  readText(): string | null;
  writeText(text: string): void;
  isSendControl(path: EventTarget[]): boolean;
  onPaste(cb: (text: string) => void): void;
  /** Every file input the surface uses. Re-queried each call: the provider
   *  re-mounts these on navigation (D4). */
  fileInputs(): HTMLInputElement[];
};
```

Add to `chatgpt.ts`:

```ts
  fileInputs() { return [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')]; },
```

and the identical member to `claude.ts`. **Both are `[verify against the live DOM]`** — the file input is often hidden and unlabelled, and doc 05 §3.1's rule applies: a committed selector reads as a spec and is wrong by the time you read it.

- [ ] **Step 2: Write the failing capture test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installFileCapture } from '../../src/files/capture';

describe('installFileCapture', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('takes the files and stops the page from seeing the change event', () => {
    const onFiles = vi.fn();
    const pageHandler = vi.fn();
    installFileCapture({ onFiles });

    const input = document.createElement('input');
    input.type = 'file';
    document.body.append(input);
    input.addEventListener('change', pageHandler);

    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'a.txt', { type: 'text/plain' }));
    Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0][0].name).toBe('a.txt');
    expect(pageHandler).not.toHaveBeenCalled();
  });

  it('ignores a change event that we ourselves dispatched', () => {
    // Otherwise re-attaching the cleaned file re-triggers capture forever.
    const onFiles = vi.fn();
    installFileCapture({ onFiles });

    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('data-vanguard-reattach', '1');
    document.body.append(input);
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onFiles).not.toHaveBeenCalled();
  });

  it('captures a drop and prevents the default', () => {
    const onFiles = vi.fn();
    installFileCapture({ onFiles });

    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'b.pdf', { type: 'application/pdf' }));
    const evt = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    window.dispatchEvent(evt);

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('leaves a text-only paste alone so the prompt path still works', () => {
    const onFiles = vi.fn();
    installFileCapture({ onFiles });
    const dt = new DataTransfer();
    dt.setData('text/plain', 'just text');
    const evt = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
    window.dispatchEvent(evt);
    expect(onFiles).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it('uninstalls cleanly', () => {
    const onFiles = vi.fn();
    const off = installFileCapture({ onFiles });
    off();
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'c.txt'));
    window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    expect(onFiles).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run and watch it fail**

```bash
cd code/extension && npx vitest run tests/files/capture.test.ts
```
Expected: `Failed to resolve import "../../src/files/capture"`

- [ ] **Step 4: Implement `capture.ts`**

```ts
/**
 * Attach-time file interception (U27).
 *
 * 🔴 Why attach and not Send: both target surfaces upload an attachment the
 * moment it is picked. A Send-time gate would review a file the provider
 * already has -- the control appears to work while the leak has happened,
 * which is doc 00 section 6's worst case.
 *
 * Mechanism is deliberately identical to the keydown gate that U12 validated:
 * `window`, capture phase, registered at document_start, and
 * `composedPath()` rather than `event.target` because shadow DOM retargets
 * (ADR 0005 / ADR 0010).
 */
export type FileCaptureOptions = {
  onFiles: (files: File[]) => void;
};

const REATTACH_ATTR = 'data-vanguard-reattach';

export function installFileCapture({ onFiles }: FileCaptureOptions): () => void {
  const onChange = (event: Event) => {
    const input = event
      .composedPath()
      .find(
        (node): node is HTMLInputElement =>
          node instanceof HTMLInputElement && node.type === 'file',
      );
    if (!input) return;
    if (input.hasAttribute(REATTACH_ATTR)) return; // our own write; let it through
    const files = [...(input.files ?? [])];
    if (files.length === 0) return;

    event.stopImmediatePropagation();
    event.preventDefault();
    input.value = ''; // the provider must not find the file if it re-reads the input
    onFiles(files);
  };

  const onDrop = (event: DragEvent) => {
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    onFiles(files);
  };

  const onDragOver = (event: DragEvent) => {
    if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
  };

  const onPaste = (event: ClipboardEvent) => {
    const files = [...(event.clipboardData?.items ?? [])]
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file != null);
    if (files.length === 0) return; // text paste is the prompt path; do not touch it
    event.stopImmediatePropagation();
    event.preventDefault();
    onFiles(files);
  };

  window.addEventListener('change', onChange, true);
  window.addEventListener('drop', onDrop, true);
  window.addEventListener('dragover', onDragOver, true);
  window.addEventListener('paste', onPaste, true);

  return () => {
    window.removeEventListener('change', onChange, true);
    window.removeEventListener('drop', onDrop, true);
    window.removeEventListener('dragover', onDragOver, true);
    window.removeEventListener('paste', onPaste, true);
  };
}
```

- [ ] **Step 5: Write the failing attach test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { attachFiles } from '../../src/files/attach';

describe('attachFiles', () => {
  it('sets input.files and fires a change the page can see', () => {
    const input = document.createElement('input');
    input.type = 'file';
    document.body.append(input);
    const seen = vi.fn();
    input.addEventListener('change', seen);

    const ok = attachFiles(input, [new File(['clean'], 'a.redacted.docx', { type: 'text/plain' })]);

    expect(ok).toBe(true);
    expect(input.files!.length).toBe(1);
    expect(input.files![0].name).toBe('a.redacted.docx');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('removes the bypass marker afterwards so the next real attach is captured', () => {
    const input = document.createElement('input');
    input.type = 'file';
    attachFiles(input, [new File(['x'], 'a.txt')]);
    expect(input.hasAttribute('data-vanguard-reattach')).toBe(false);
  });
});
```

- [ ] **Step 6: Implement `attach.ts`**

```ts
/**
 * The write half of the interceptor: hand the provider the file WE chose.
 *
 * Mirrors `adapter.writeText()` -- same contract, same reason. U28 is the
 * verified claim that setting `input.files` from a synthesized DataTransfer
 * makes the provider upload our bytes.
 */
const REATTACH_ATTR = 'data-vanguard-reattach';

export function attachFiles(input: HTMLInputElement, files: File[]): boolean {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);

  try {
    input.files = transfer.files;
  } catch {
    return false; // read-only in some engines; caller surfaces the failure
  }

  // Marked so our own capture listener lets this change event through, then
  // unmarked immediately -- a marker left behind would blind the interceptor
  // to the user's NEXT attach, which fails open and silently.
  input.setAttribute(REATTACH_ATTR, '1');
  try {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } finally {
    input.removeAttribute(REATTACH_ATTR);
  }
  return input.files.length === files.length;
}
```

- [ ] **Step 7: Run both test files**

```bash
cd code/extension && npx vitest run tests/files/capture.test.ts tests/files/attach.test.ts tests/adapters.test.ts
```
Expected: all pass. `adapters.test.ts` is included because `SurfaceAdapter` changed.

- [ ] **Step 8: Commit**

```bash
git add code/extension/src code/extension/tests
git commit -m "feat(ext): attach-time file interception and DataTransfer re-attach"
```

---

### Task 9: The extract API client and its configuration

**Files:**
- Create: `code/extension/src/files/config.ts`, `code/extension/src/files/api.ts`
- Test: `code/extension/tests/files/api.test.ts`

**Interfaces:**
- Consumes: `ExtractResponse`, `ApiErrorCode` from `src/files/types`.
- Produces: `extractFile(file: File): Promise<ExtractResponse>` and `redactFile(file, extractSha256, spans): Promise<File>`, both throwing `ExtractError { code, message }`; `getApiBase(): Promise<string>`; `CLIENT_LIMITS`.

- [ ] **Step 1: Write `config.ts`**

```ts
/**
 * Every client-side Slice 2 limit, in one place, each tagged (estimate).
 * `code/README.md`: "the scaffold does not launder an estimate into a
 * constant by writing it in code." These are team-test values and the team
 * test is what replaces them.
 */
export const CLIENT_LIMITS = {
  /** Refuse locally before spending an upload. Mirrors backend MAX_UPLOAD_BYTES. */
  maxUploadBytes: 10 * 1024 * 1024, // (estimate)
  /** Generous: the backend's own wall clock is 30s and this must not fire first. */
  requestTimeoutMs: 45_000, // (estimate)
  /** L2 over a full extract is seconds, not milliseconds -- doc 06 section 1's
   *  SOFT deadline. The prompt's HARD gate is unaffected. */
  fileScanTimeoutMs: 180_000, // (estimate)
} as const;

const DEFAULT_BASE = 'http://localhost:8000';
const KEY = 'vg_api_base';

export async function getApiBase(): Promise<string> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as string | undefined;
  return (stored || DEFAULT_BASE).replace(/\/+$/, '');
}

export async function setApiBase(base: string): Promise<void> {
  await chrome.storage.local.set({ [KEY]: base.replace(/\/+$/, '') });
}
```

- [ ] **Step 2: Write the failing API-client test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExtractError, extractFile } from '../../src/files/api';

const okBody = {
  extract: 'Ahmad 880101-14-5566',
  chars: 20,
  truncated: false,
  format: 'txt',
  coverage: { read: ['file text'], not_read: [], pages_total: null, pages_with_text: null },
  warnings: [],
};

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('extractFile', () => {
  it('returns the parsed body on 200', async () => {
    vi.stubGlobal('fetch', mockFetch(200, okBody));
    const r = await extractFile(new File(['x'], 'a.txt'));
    expect(r.extract).toContain('880101-14-5566');
  });

  it('throws a typed error carrying the backend message verbatim', async () => {
    vi.stubGlobal('fetch', mockFetch(422, {
      error: { code: 'no_text_layer', message: 'This PDF looks like a scan…' },
    }));
    await expect(extractFile(new File(['x'], 'a.pdf'))).rejects.toMatchObject({
      code: 'no_text_layer',
      message: 'This PDF looks like a scan…',
    });
  });

  it('refuses an oversized file WITHOUT uploading it', async () => {
    const fetchSpy = mockFetch(200, okBody);
    vi.stubGlobal('fetch', fetchSpy);
    const huge = new File([new ArrayBuffer(11 * 1024 * 1024)], 'big.txt');
    await expect(extractFile(huge)).rejects.toMatchObject({ code: 'too_large' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a dead backend to a network error naming the fix', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(extractFile(new File(['x'], 'a.txt'))).rejects.toMatchObject({ code: 'network' });
  });
});
```

- [ ] **Step 3: Run and watch it fail**

```bash
cd code/extension && npx vitest run tests/files/api.test.ts
```
Expected: `Failed to resolve import "../../src/files/api"`

- [ ] **Step 4: Implement `api.ts`**

```ts
import { CLIENT_LIMITS, getApiBase } from './config';
import type { ApiErrorCode, ExtractResponse } from './types';

export class ExtractError extends Error {
  constructor(public code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ExtractError';
  }
}

export async function extractFile(file: File): Promise<ExtractResponse> {
  if (file.size > CLIENT_LIMITS.maxUploadBytes) {
    // Refuse locally: uploading 40 MB in order to be told it is too big wastes
    // the user's bandwidth and puts the bytes on the wire for no purpose.
    const mb = (file.size / 1024 / 1024).toFixed(0);
    throw new ExtractError(
      'too_large',
      `"${file.name}" is ${mb} MB. Vanguard checks files up to 10 MB, so it was ` +
        'not checked and has not been sent to the AI.',
    );
  }

  const base = await getApiBase();
  const body = new FormData();
  body.append('file', file, file.name);

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CLIENT_LIMITS.requestTimeoutMs);

  let response: Response;
  try {
    response = await fetch(`${base}/v1/extract`, {
      method: 'POST',
      body,
      signal: abort.signal,
      headers: { 'x-vanguard-filename': encodeURIComponent(file.name) },
    });
  } catch (err) {
    if (abort.signal.aborted) {
      throw new ExtractError(
        'timeout',
        `"${file.name}" took too long to check, so it has not been sent to the AI.`,
      );
    }
    throw new ExtractError(
      'network',
      "Vanguard couldn't reach the file-checking service, so this file was not " +
        'checked and has not been sent to the AI. Check that the service is ' +
        "running, or update its address in the extension's options.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: ApiErrorCode; message?: string } }
      | null;
    throw new ExtractError(
      payload?.error?.code ?? 'parse_failed',
      payload?.error?.message ??
        `"${file.name}" could not be checked, so it has not been sent to the AI.`,
    );
  }

  return (await response.json()) as ExtractResponse;
}

export type RedactSpanPayload = {
  start: number;
  end: number;
  text: string;
  placeholder: string;
};

/**
 * Apply accepted masks to the ORIGINAL file and get the same format back.
 *
 * The original bytes are re-uploaded because the backend kept nothing between
 * calls (F4). `extractSha256` is what makes it safe: the backend re-parses and
 * refuses if the text differs from what the user actually reviewed.
 */
export async function redactFile(
  file: File,
  extractSha256: string,
  spans: RedactSpanPayload[],
): Promise<File> {
  const base = await getApiBase();
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('spec', JSON.stringify({ extract_sha256: extractSha256, spans }));

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CLIENT_LIMITS.requestTimeoutMs);

  let response: Response;
  try {
    response = await fetch(`${base}/v1/redact`, { method: 'POST', body, signal: abort.signal });
  } catch {
    throw new ExtractError(
      'network',
      "Vanguard couldn't reach the file-checking service to apply your changes, so " +
        'nothing was attached. Check the service and try Proceed again.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: ApiErrorCode; message?: string } }
      | null;
    throw new ExtractError(
      payload?.error?.code ?? 'redaction_failed',
      payload?.error?.message ??
        `"${file.name}" could not be redacted, so it has not been sent to the AI.`,
    );
  }

  const name = response.headers.get('x-vanguard-redacted-name') ?? `${file.name}.redacted`;
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || file.type });
}
```

🔴 **Note what this function does NOT do: fall back.** If redaction fails there is no quiet `.txt`, no quiet original. It throws, and Task 13 surfaces the failure to the user. **Global Constraint 15 exists because a silent fallback here is the single easiest way to turn this feature into theatre.**

- [ ] **Step 5: Add the options page**

Create `code/extension/entrypoints/options/index.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<title>Vanguard options</title>
<body style="font:14px system-ui;padding:24px;max-width:520px">
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
```

Create `code/extension/entrypoints/options/main.tsx`:

```tsx
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getApiBase, setApiBase } from '../../src/files/config';

function Options() {
  const [base, setBase] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { void getApiBase().then(setBase); }, []);
  return (
    <div>
      <h1 style="font-size:18px">Vanguard — file checking</h1>
      <p style="color:#475569">
        Address of the file-checking service. Use <code>http://localhost:8000</code> if you are
        running it yourself, or the shared address your team was given.
      </p>
      <input
        value={base}
        onInput={(e) => { setBase((e.target as HTMLInputElement).value); setSaved(false); }}
        style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px"
      />
      <button
        onClick={async () => { await setApiBase(base); setSaved(true); }}
        style="margin-top:12px;padding:8px 14px;border:none;border-radius:6px;background:#e11d48;color:#fff;cursor:pointer"
      >Save</button>
      {saved && <span style="margin-left:10px;color:#15803d">Saved</span>}
    </div>
  );
}

render(<Options />, document.getElementById('root')!);
```

Modify `wxt.config.ts` — add to `manifest`:

```ts
    host_permissions: [
      'https://chatgpt.com/*',
      'https://claude.ai/*',
      'http://localhost:8000/*',
      // [set this to the founder-hosted team-test origin before the team test]
      'https://vanguard-extract.example.com/*',
    ],
```

- [ ] **Step 6: Run the tests**

```bash
cd code/extension && npx vitest run tests/files/api.test.ts
```
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add code/extension
git commit -m "feat(ext): extract API client, configurable base URL, options page"
```

---

### Task 10: The file pipeline — attach → extract → on-device scan

**Files:**
- Create: `code/extension/src/files/pipeline.ts`
- Test: `code/extension/tests/files/pipeline.test.ts`

**Interfaces:**
- Consumes: `FileStore`, `extractFile`, `ExtractError`, `scanInto`, `VerdictCache`, `initDecisions`.
- Produces: `processFile(store, id, deps): Promise<void>` where `deps = { extract, scan }`, both injectable for tests.

🔴 **This task is where ADR 0013's monotonic rule reaches files.** L1 runs on the extract and may mark the file DIRTY immediately; only a completed L1+L2 scan may mark it clean. `scanInto` already implements exactly this — it is reused, not reimplemented.

- [ ] **Step 1: Write the failing pipeline test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { FileStore } from '../../src/files/store';
import { processFile } from '../../src/files/pipeline';
import { ExtractError } from '../../src/files/api';

const coverage = { read: ['file text'], not_read: [], pages_total: null, pages_with_text: null };

describe('processFile', () => {
  it('walks held -> extracting -> scanning -> scanned', async () => {
    const store = new FileStore();
    const id = store.add(new File(['x'], 'a.txt'));
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.get(id)!.status.kind));

    await processFile(store, id, {
      extract: async () => ({
        extract: 'Ahmad 880101-14-5566', chars: 20, truncated: false,
        format: 'txt' as const, coverage, warnings: [],
      }),
      scan: async () => ({
        state: 'DIRTY' as const, complete: true,
        findings: [{ cls: 'NRIC' as const, start: 6, end: 20, text: '880101-14-5566' }],
      }),
    });

    expect(seen).toEqual(['extracting', 'scanning', 'scanned']);
    expect(store.get(id)!.findings).toHaveLength(1);
  });

  it('initialises one pending decision per finding', async () => {
    const store = new FileStore();
    const id = store.add(new File(['x'], 'a.txt'));
    await processFile(store, id, {
      extract: async () => ({
        extract: 'Ahmad 880101-14-5566', chars: 20, truncated: false,
        format: 'txt' as const, coverage, warnings: [],
      }),
      scan: async () => ({
        state: 'DIRTY' as const, complete: true,
        findings: [{ cls: 'NRIC' as const, start: 6, end: 20, text: '880101-14-5566' }],
      }),
    });
    expect(store.get(id)!.decisions!.size).toBe(1);
    expect(store.allResolved()).toBe(false);
  });

  it('stores the API error message verbatim for the user to read', async () => {
    const store = new FileStore();
    const id = store.add(new File(['x'], 'a.pdf'));
    await processFile(store, id, {
      extract: async () => { throw new ExtractError('no_text_layer', 'This PDF looks like a scan…'); },
      scan: async () => ({ state: 'CLEAN' as const, complete: true, findings: [] }),
    });
    expect(store.get(id)!.status).toMatchObject({
      kind: 'error', code: 'no_text_layer', message: 'This PDF looks like a scan…',
    });
  });

  it('does NOT mark a file clean when the on-device engine degraded', async () => {
    // ADR 0013/0014: an incomplete scan is advisory, never CLEAN. A file that
    // was never really checked must not read as checked.
    const store = new FileStore();
    const id = store.add(new File(['x'], 'a.txt'));
    await processFile(store, id, {
      extract: async () => ({
        extract: 'text', chars: 4, truncated: false, format: 'txt' as const, coverage, warnings: [],
      }),
      scan: async () => ({ state: 'ADVISORY' as const, complete: false, findings: [] }),
    });
    expect(store.get(id)!.status).toMatchObject({ kind: 'error', code: 'parse_failed' });
    expect(store.get(id)!.status.message).toContain('could not be fully checked');
  });

  it('surfaces truncation and coverage to the store for the UI to render', async () => {
    const store = new FileStore();
    const id = store.add(new File(['x'], 'a.pdf'));
    await processFile(store, id, {
      extract: async () => ({
        extract: 'body', chars: 4, truncated: true, format: 'pdf' as const,
        coverage: { read: ['text layer'], not_read: ['4 pages with no text layer (no OCR)'], pages_total: 10, pages_with_text: 6 },
        warnings: ['4 of 10 pages had no readable text (likely scans) and were not checked.'],
      }),
      scan: async () => ({ state: 'CLEAN' as const, complete: true, findings: [] }),
    });
    expect(store.get(id)!.coverage!.not_read).toEqual(['4 pages with no text layer (no OCR)']);
    expect(store.get(id)!.truncated).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd code/extension && npx vitest run tests/files/pipeline.test.ts
```
Expected: `Failed to resolve import "../../src/files/pipeline"`

- [ ] **Step 3: Implement `pipeline.ts`**

```ts
import type { Verdict } from '../detection/verdict-cache';
import { initDecisions } from '../ui/send-review-logic';
import { ExtractError, extractFile } from './api';
import type { FileStore } from './store';
import type { ExtractResponse } from './types';

export type PipelineDeps = {
  extract: (file: File) => Promise<ExtractResponse>;
  scan: (text: string) => Promise<Verdict>;
};

export const defaultDeps = (scan: (text: string) => Promise<Verdict>): PipelineDeps => ({
  extract: extractFile,
  scan,
});

export async function processFile(
  store: FileStore,
  id: string,
  deps: PipelineDeps,
): Promise<void> {
  const held = store.get(id);
  if (!held) return;

  store.update(id, { status: { kind: 'extracting' } });

  let extracted: ExtractResponse;
  try {
    extracted = await deps.extract(held.file);
  } catch (err) {
    const known = err instanceof ExtractError;
    store.update(id, {
      status: {
        kind: 'error',
        code: known ? err.code : 'parse_failed',
        message: known
          ? err.message
          : `"${held.file.name}" could not be checked, so it has not been sent to the AI.`,
      },
    });
    return;
  }

  store.update(id, {
    status: { kind: 'scanning' },
    extract: extracted.extract,
    extractSha256: extracted.extract_sha256,
    truncated: extracted.truncated,
    coverage: extracted.coverage,
    warnings: extracted.warnings,
  });

  // 🔴 The SAME detector stack the prompt uses (ADR 0018 section 4). One L1,
  // one L2, one seam for the trained model to replace after Slice 2.
  const verdict = await deps.scan(extracted.extract);

  if (!verdict.complete) {
    // ADR 0013: only a COMPLETED L1+L2 scan may say clean. An incomplete scan
    // presented as a pass is the silent fail-open the whole product exists to
    // prevent. Surface it and let the user consciously escape (ADR 0014).
    store.update(id, {
      status: {
        kind: 'error',
        code: 'parse_failed',
        message:
          `"${held.file.name}" could not be fully checked because the on-device ` +
          'engine is unavailable. It has not been sent to the AI.',
      },
      findings: verdict.findings,
    });
    return;
  }

  store.update(id, {
    status: { kind: 'scanned' },
    findings: verdict.findings,
    decisions: initDecisions(verdict.findings),
  });
}
```

- [ ] **Step 4: Run the tests**

```bash
cd code/extension && npx vitest run tests/files/pipeline.test.ts
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add code/extension/src/files code/extension/tests/files
git commit -m "feat(ext): file pipeline reusing the prompt detector stack, monotonic toward dirty"
```

---

### Task 11: The review pane model and the tabbed modal

**Files:**
- Create: `code/extension/src/ui/review-panes.ts`
- Modify: `code/extension/src/ui/modal.tsx`
- Test: `code/extension/tests/ui/review-panes.test.ts`
- Test: `code/extension/tests/modal.test.tsx` (extend)

**Interfaces:**
- Consumes: `HeldFile`, `SpanDecisionMap`, `buildPreviewSegments`, `pendingCount`, `allResolved`.
- Produces: `PaneId = 'prompt' | \`file:${string}\``, `buildPanes(promptFindings, promptDecisions, files): Pane[]`, `canProceed(panes): boolean`, and `ModalProps` extended with `files`, `onFileDecision`, `onAcknowledgeFileError`.

🔴 **This extends the existing Send review surface. It does not introduce a second modal system.** `buildPreviewSegments`, `SpanDecisionMap`, `spanKey`, `whyForClass`, `buildFinalText` and `acceptAllDecisions` are all reused **unchanged** — the file extract is just another `text` + `findings` pair, which is why `send-review-logic.ts` needed no edit.

- [ ] **Step 1: Write the failing pane-model test**

```ts
import { describe, expect, it } from 'vitest';
import { buildPanes, canProceed } from '../../src/ui/review-panes';
import type { HeldFile } from '../../src/files/types';

const nric = { cls: 'NRIC' as const, start: 0, end: 14, text: '880101-14-5566' };

const scannedFile = (over: Partial<HeldFile> = {}): HeldFile => ({
  id: 'f1',
  file: new File(['x'], 'payroll.pdf'),
  status: { kind: 'scanned' },
  extract: '880101-14-5566 is the IC',
  findings: [nric],
  decisions: new Map([['NRIC:0:14:880101-14-5566', { kind: 'pending' }]]),
  ...over,
});

describe('buildPanes', () => {
  it('always puts the prompt pane first', () => {
    const panes = buildPanes('hello', [], new Map(), [scannedFile()]);
    expect(panes[0].id).toBe('prompt');
    expect(panes[1].id).toBe('file:f1');
  });

  it('labels a scanning file so the tab reads as in-progress', () => {
    const panes = buildPanes('hello', [], new Map(), [
      scannedFile({ status: { kind: 'scanning' }, findings: undefined, decisions: undefined }),
    ]);
    expect(panes[1].state).toBe('busy');
    expect(panes[1].badge).toBe('Checking…');
  });

  it('badges a scanned pane with its pending count', () => {
    const panes = buildPanes('hello', [], new Map(), [scannedFile()]);
    expect(panes[1].state).toBe('dirty');
    expect(panes[1].badge).toBe('1');
  });

  it('badges a clean file as clear', () => {
    const panes = buildPanes('hello', [], new Map(), [
      scannedFile({ findings: [], decisions: new Map() }),
    ]);
    expect(panes[1].state).toBe('clean');
    expect(panes[1].badge).toBe('No issues');
  });

  it('surfaces an error pane with the backend message', () => {
    const panes = buildPanes('hello', [], new Map(), [
      scannedFile({ status: { kind: 'error', code: 'no_text_layer', message: 'It is a scan.' } }),
    ]);
    expect(panes[1].state).toBe('error');
    expect(panes[1].message).toBe('It is a scan.');
  });
});

describe('canProceed', () => {
  it('is false while any pane is busy', () => {
    expect(canProceed(buildPanes('hi', [], new Map(), [
      scannedFile({ status: { kind: 'scanning' }, findings: undefined, decisions: undefined }),
    ]))).toBe(false);
  });

  it('is false while a file span is pending', () => {
    expect(canProceed(buildPanes('hi', [], new Map(), [scannedFile()]))).toBe(false);
  });

  it('is false while a prompt span is pending even if the file is clean', () => {
    const panes = buildPanes(
      'call Ahmad', [{ cls: 'PERSON', start: 5, end: 10, text: 'Ahmad' }],
      new Map([['PERSON:5:10:Ahmad', { kind: 'pending' }]]),
      [scannedFile({ findings: [], decisions: new Map() })],
    );
    expect(canProceed(panes)).toBe(false);
  });

  it('is true when everything is resolved', () => {
    const panes = buildPanes('hi', [], new Map(), [
      scannedFile({ decisions: new Map([['NRIC:0:14:880101-14-5566', { kind: 'accepted', placeholder: 'NRIC_1' }]]) }),
    ]);
    expect(canProceed(panes)).toBe(true);
  });

  it('is true with no file at all', () => {
    expect(canProceed(buildPanes('hi', [], new Map(), []))).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd code/extension && npx vitest run tests/ui/review-panes.test.ts
```
Expected: `Failed to resolve import "../../src/ui/review-panes"`

- [ ] **Step 3: Implement `review-panes.ts`**

```ts
import type { Finding } from '../detection/l1/types';
import type { Coverage, HeldFile } from '../files/types';
import { allResolved, pendingCount, type SpanDecisionMap } from './send-review-logic';

export type PaneId = 'prompt' | `file:${string}`;
export type PaneState = 'clean' | 'dirty' | 'busy' | 'error';

export type Pane = {
  id: PaneId;
  title: string;
  state: PaneState;
  badge: string;
  /** Present for prompt and for a scanned file; absent while busy or errored. */
  text?: string;
  findings?: Finding[];
  decisions?: SpanDecisionMap;
  coverage?: Coverage;
  warnings?: string[];
  truncated?: boolean;
  /** Error panes only. */
  message?: string;
  fileId?: string;
  fileName?: string;
};

export function buildPanes(
  promptText: string,
  promptFindings: Finding[],
  promptDecisions: SpanDecisionMap,
  files: HeldFile[],
): Pane[] {
  const promptPending = pendingCount(promptDecisions);
  const panes: Pane[] = [
    {
      id: 'prompt',
      title: 'Prompt',
      state: promptFindings.length === 0 ? 'clean' : promptPending > 0 ? 'dirty' : 'clean',
      badge: promptFindings.length === 0
        ? 'No issues'
        : promptPending > 0 ? String(promptPending) : 'Resolved',
      text: promptText,
      findings: promptFindings,
      decisions: promptDecisions,
    },
  ];

  for (const held of files) {
    const base = { id: `file:${held.id}` as PaneId, title: held.file.name, fileId: held.id, fileName: held.file.name };

    switch (held.status.kind) {
      case 'held':
      case 'extracting':
      case 'scanning':
        panes.push({ ...base, state: 'busy', badge: 'Checking…' });
        break;
      case 'error':
        panes.push({ ...base, state: 'error', badge: 'Not checked', message: held.status.message });
        break;
      case 'error_acknowledged':
        panes.push({ ...base, state: 'error', badge: 'Sending anyway', message: held.status.message });
        break;
      case 'scanned': {
        const decisions = held.decisions ?? new Map();
        const pending = pendingCount(decisions);
        panes.push({
          ...base,
          state: (held.findings?.length ?? 0) === 0 ? 'clean' : pending > 0 ? 'dirty' : 'clean',
          badge: (held.findings?.length ?? 0) === 0
            ? 'No issues'
            : pending > 0 ? String(pending) : 'Resolved',
          text: held.extract,
          findings: held.findings,
          decisions,
          coverage: held.coverage,
          warnings: held.warnings,
          truncated: held.truncated,
        });
        break;
      }
    }
  }

  return panes;
}

export function canProceed(panes: Pane[]): boolean {
  for (const pane of panes) {
    if (pane.state === 'busy') return false;
    // An unacknowledged error blocks; 'Sending anyway' is the acknowledged form
    // and is allowed through (ADR 0014 -- degrade, never fail-closed).
    if (pane.state === 'error' && pane.badge === 'Not checked') return false;
    if (pane.decisions && !allResolved(pane.decisions)) return false;
  }
  return true;
}
```

- [ ] **Step 4: Extend `ModalProps` and render the tab strip**

Modify `code/extension/src/ui/modal.tsx`. Replace the `ModalProps` / `ProceedResult` block at lines 17–27 with:

```tsx
export type FileProceed = {
  id: string;
  finalText: string;
  ignored: Array<{ finding: Finding; reason: string }>;
  /** True when nothing was accepted -- the ORIGINAL bytes may be re-attached
   *  and the user keeps their formatting. */
  unchanged: boolean;
};

export type ProceedResult = {
  finalText: string;
  ignored: Array<{ finding: Finding; reason: string }>;
  files: FileProceed[];
};

export type ModalProps = {
  text: string;
  findings: Finding[];
  numbering: SessionNumbering;
  /** Live view of held files. The modal re-renders as each one lands, which
   *  is the progressive UI: the Prompt pane is usable while File says
   *  "Checking...". */
  files: HeldFile[];
  onAcknowledgeFileError: (id: string, reason: string) => void;
  onProceed: (result: ProceedResult) => void;
};
```

Add the imports at the top of the file:

```tsx
import type { HeldFile } from '../files/types';
import { buildPanes, canProceed, type Pane, type PaneId } from './review-panes';
```

Add two style entries to the `shell` object:

```tsx
  tabs: 'display:flex;gap:4px;padding:0 20px;border-bottom:1px solid #ffe4e6;background:#fff;flex-shrink:0;overflow-x:auto',
  tab: 'border:none;background:none;padding:10px 12px;font:600 13px Segoe UI,system-ui,sans-serif;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap',
  tabActive: 'border:none;background:none;padding:10px 12px;font:600 13px Segoe UI,system-ui,sans-serif;color:#9f1239;cursor:pointer;border-bottom:2px solid #e11d48;white-space:nowrap',
  badge: 'margin-left:6px;display:inline-block;min-width:18px;padding:1px 6px;border-radius:9px;background:#ffe4e6;color:#9f1239;font-size:11px;font-weight:700',
  coverage: 'margin:10px 0 0;padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font:12px/1.5 Segoe UI,system-ui,sans-serif;color:#475569',
  errorPane: 'margin:0;padding:16px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;font:14px/1.6 Segoe UI,system-ui,sans-serif;color:#7c2d12',
```

Inside `Modal`, add the per-pane decision state and the active tab:

```tsx
  const [activePane, setActivePane] = useState<PaneId>('prompt');
  const [fileDecisions, setFileDecisions] = useState<Map<string, SpanDecisionMap>>(new Map());

  // Seed a file's decisions the first time its scan lands.
  useEffect(() => {
    setFileDecisions((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const held of files) {
        if (held.status.kind === 'scanned' && !next.has(held.id)) {
          next.set(held.id, initDecisions(held.findings ?? []));
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [files]);

  const panes = useMemo(
    () =>
      buildPanes(
        text,
        findings,
        decisions,
        files.map((h) => ({ ...h, decisions: fileDecisions.get(h.id) ?? h.decisions })),
      ),
    [text, findings, decisions, files, fileDecisions],
  );

  const pane = panes.find((p) => p.id === activePane) ?? panes[0];
  const proceedable = canProceed(panes);
```

🔴 **`resolved` at line 96 must now be replaced by `proceedable`** — the Proceed button's `disabled` binding and its label must read from the pane model, not from the prompt's decisions alone. Otherwise Proceed enables while a file span is still pending, which is exactly the founder's step 9 violated.

Render the tab strip between the header and the body:

```tsx
  {panes.length > 1 && (
    <div style={shell.tabs} role="tablist">
      {panes.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={p.id === activePane}
          style={p.id === activePane ? shell.tabActive : shell.tab}
          onClick={() => setActivePane(p.id)}
        >
          {p.title}
          <span style={shell.badge}>{p.badge}</span>
        </button>
      ))}
    </div>
  )}
```

And branch the body on `pane.state`:

```tsx
  {pane.state === 'busy' && (
    <p style={shell.errorPane}>
      Checking “{pane.fileName}”… The prompt above is ready to review while this finishes.
    </p>
  )}

  {pane.state === 'error' && (
    <div>
      <p style={shell.errorPane}>{pane.message}</p>
      {pane.badge === 'Not checked' && (
        <div style="margin-top:12px">
          <input
            style={shell.reason}
            placeholder="Why are you sending this unchecked file? (required)"
            data-vg-autofocus
            onKeyDown={(e) => {
              const value = (e.target as HTMLInputElement).value.trim();
              if (e.key === 'Enter' && value) onAcknowledgeFileError(pane.fileId!, value);
            }}
          />
          <p style="margin:0;font:12px Segoe UI,system-ui;color:#7c2d12">
            Vanguard could not read this file, so it cannot mask anything in it.
            Sending it attaches the original, and the reason is recorded.
          </p>
        </div>
      )}
    </div>
  )}
```

For `pane.state === 'clean' | 'dirty'`, render the **existing** preview markup, but reading `pane.text`, `pane.findings` and `pane.decisions` instead of the closure's `text` / `findings` / `decisions`, and append the coverage line:

```tsx
  {pane.coverage && (
    <p style={shell.coverage}>
      <strong>What Vanguard read:</strong> {pane.coverage.read.join(', ') || 'nothing'}.
      {pane.coverage.not_read.length > 0 && (
        <> <strong>Not read:</strong> {pane.coverage.not_read.join(', ')} — anything sensitive in there was not checked.</>
      )}
      {pane.truncated && <> Only the first part of this file was checked.</>}
    </p>
  )}
```

- [ ] **Step 5: Extend `tests/modal.test.tsx`**

```tsx
it('shows a File tab that reads Checking while the scan is in flight', async () => {
  const held: HeldFile = {
    id: 'f1',
    file: new File(['x'], 'payroll.pdf'),
    status: { kind: 'scanning' },
  };
  render(
    <Modal
      text="hello"
      findings={[]}
      numbering={new SessionNumbering()}
      files={[held]}
      onAcknowledgeFileError={() => {}}
      onProceed={() => {}}
    />,
  );
  expect(screen.getByRole('tab', { name: /payroll\.pdf/ })).toBeTruthy();
  expect(screen.getByText(/Checking/)).toBeTruthy();
});

it('keeps Proceed disabled while a file span is pending', async () => {
  const held: HeldFile = {
    id: 'f1',
    file: new File(['x'], 'payroll.pdf'),
    status: { kind: 'scanned' },
    extract: '880101-14-5566',
    findings: [{ cls: 'NRIC', start: 0, end: 14, text: '880101-14-5566' }],
    decisions: new Map(),
  };
  render(
    <Modal
      text="a clean prompt"
      findings={[]}
      numbering={new SessionNumbering()}
      files={[held]}
      onAcknowledgeFileError={() => {}}
      onProceed={() => {}}
    />,
  );
  const proceed = screen.getByRole('button', { name: /Proceed/ }) as HTMLButtonElement;
  expect(proceed.disabled).toBe(true);
});

it('renders the not-read coverage line so the boundary of the check is visible', () => {
  const held: HeldFile = {
    id: 'f1',
    file: new File(['x'], 'scan.pdf'),
    status: { kind: 'scanned' },
    extract: 'body text',
    findings: [],
    decisions: new Map(),
    coverage: { read: ['text layer'], not_read: ['4 pages with no text layer (no OCR)'], pages_total: 10, pages_with_text: 6 },
  };
  render(
    <Modal text="hi" findings={[]} numbering={new SessionNumbering()} files={[held]}
      onAcknowledgeFileError={() => {}} onProceed={() => {}} />,
  );
  fireEvent.click(screen.getByRole('tab', { name: /scan\.pdf/ }));
  expect(screen.getByText(/4 pages with no text layer/)).toBeTruthy();
});
```

- [ ] **Step 6: Run the UI tests**

```bash
cd code/extension && npx vitest run tests/ui/review-panes.test.ts tests/modal.test.tsx tests/send-review-logic.test.ts
```
Expected: all pass. `send-review-logic.test.ts` is included to prove the shared logic was **not** modified.

- [ ] **Step 7: Commit**

```bash
git add code/extension/src/ui code/extension/tests
git commit -m "feat(ext): tabbed Prompt|File review extending the existing Send review surface"
```

---

### Task 12: Building the cleaned attachment — in the original format

**Files:**
- Create: `code/extension/src/files/cleaned.ts`
- Test: `code/extension/tests/files/cleaned.test.ts`

**Interfaces:**
- Consumes: `redactFile`, `ExtractError`, `SessionNumbering`, `HeldFile`, `SpanDecisionMap`.
- Produces: `buildCleanedFile(held, decisions, numbering): Promise<File>` — returns the **original `File` object** when nothing was accepted, and otherwise the backend-redacted file **in its original format**.

🔴 **AMENDED 2026-07-18 (founder). The previous version of this task produced `<name>.redacted.txt` whenever anything was accepted. That is no longer the design and it is not the fallback either.** The extract is a **decision surface**; the output is the **original file with masks applied**. See the amended ADR 0027 in Task 15.

| Case | Output |
|---|---|
| No findings, or **every** span Ignored | 🟢 **The original `File` object, byte-identical.** PDF stays PDF, DOCX stays DOCX, images included. Nothing changed, so nothing is degraded. |
| Any span Accepted, **DOCX** | `name.redacted.docx` — text masked in the OOXML, `word/media/` preserved |
| Any span Accepted, **PDF** | `name.redacted.pdf` — text-layer spans removed, image XObjects preserved *(gated on U30)* |
| Any span Accepted, **CSV / TXT** | `name.redacted.csv` / `.txt` — text in, text out; there are no images to keep |
| Redaction **fails** | 🔴 **Nothing is attached and the user is told.** No silent `.txt`, no silent original. |

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { SessionNumbering } from '../../src/mask/placeholder';
import { buildCleanedFile } from '../../src/files/cleaned';
import { ExtractError } from '../../src/files/api';
import type { HeldFile } from '../../src/files/types';

const nric = { cls: 'NRIC' as const, start: 6, end: 20, text: '880101-14-5566' };

const held = (over: Partial<HeldFile> = {}): HeldFile => ({
  id: 'f1',
  file: new File(['original bytes'], 'payroll.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }),
  status: { kind: 'scanned' },
  extract: 'Ahmad 880101-14-5566 is the IC',
  extractSha256: 'abc123',
  findings: [nric],
  ...over,
});

const accepted = new Map([
  ['NRIC:6:20:880101-14-5566', { kind: 'accepted' as const, placeholder: 'NRIC_1' }],
]);

describe('buildCleanedFile', () => {
  it('returns the ORIGINAL file object, untouched, when every span was ignored', async () => {
    const redact = vi.fn();
    const source = held();
    const out = await buildCleanedFile(
      source,
      new Map([['NRIC:6:20:880101-14-5566', { kind: 'ignored', reason: 'my own IC' }]]),
      new SessionNumbering(),
      { redact },
    );
    expect(out).toBe(source.file);          // identity: not a copy, not a rewrite
    expect(redact).not.toHaveBeenCalled();  // and no pointless round trip
  });

  it('returns the original file when there were no findings at all', async () => {
    const redact = vi.fn();
    const source = held({ findings: [] });
    const out = await buildCleanedFile(source, new Map(), new SessionNumbering(), { redact });
    expect(out).toBe(source.file);
    expect(redact).not.toHaveBeenCalled();
  });

  it('sends ONLY accepted spans to the backend and returns its file verbatim', async () => {
    const redacted = new File(['docx bytes'], 'payroll.redacted.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const redact = vi.fn(async () => redacted);
    const email = { cls: 'EMAIL' as const, start: 0, end: 5, text: 'Ahmad' };

    const out = await buildCleanedFile(
      held({ findings: [email, nric] }),
      new Map([
        ['EMAIL:0:5:Ahmad', { kind: 'ignored', reason: 'public figure' }],
        ['NRIC:6:20:880101-14-5566', { kind: 'accepted', placeholder: 'NRIC_1' }],
      ]),
      new SessionNumbering(),
      { redact },
    );

    expect(out).toBe(redacted);
    expect(out.name).toBe('payroll.redacted.docx');
    expect(out.type).toContain('wordprocessingml');   // 🔴 a DOCX, not a .txt

    const [file, sha, spans] = redact.mock.calls[0];
    expect(file.name).toBe('payroll.docx');   // the ORIGINAL bytes are re-uploaded
    expect(sha).toBe('abc123');
    expect(spans).toEqual([{ start: 6, end: 20, text: '880101-14-5566', placeholder: 'NRIC_1' }]);
  });

  it('mints a placeholder when the decision did not carry one', async () => {
    const redact = vi.fn(async () => new File(['x'], 'payroll.redacted.docx'));
    await buildCleanedFile(
      held(),
      new Map([['NRIC:6:20:880101-14-5566', { kind: 'accepted', placeholder: '' }]]),
      new SessionNumbering(),
      { redact },
    );
    expect(redact.mock.calls[0][2][0].placeholder).toMatch(/^NRIC_\d+$/);
  });

  it('PROPAGATES a redaction failure rather than falling back to text', async () => {
    // 🔴 Global Constraint 15. A silent .txt fallback here would turn a failed
    // mask into a file the user believes is masked, in a different format they
    // did not ask for. Both halves are wrong; fail loudly instead.
    const redact = vi.fn(async () => {
      throw new ExtractError('redaction_failed', 'Could not apply 1 of the masks.');
    });
    await expect(
      buildCleanedFile(held(), accepted, new SessionNumbering(), { redact }),
    ).rejects.toMatchObject({ code: 'redaction_failed' });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd code/extension && npx vitest run tests/files/cleaned.test.ts
```
Expected: `Failed to resolve import "../../src/files/cleaned"`

- [ ] **Step 3: Implement `cleaned.ts`**

```ts
import type { SessionNumbering } from '../mask/placeholder';
import { spanKey, type SpanDecisionMap } from '../ui/send-review-logic';
import { redactFile, type RedactSpanPayload } from './api';
import type { HeldFile } from './types';

export type CleanedDeps = {
  redact: (file: File, sha: string, spans: RedactSpanPayload[]) => Promise<File>;
};

/**
 * Produce the file the provider will actually receive.
 *
 * 🔴 The extract is a DECISION SURFACE, not the output. We do not convert text
 * back into a document. We send the ORIGINAL bytes plus the accepted spans to
 * /v1/redact, which applies the masks in place -- a DOCX comes back a DOCX with
 * word/media/ intact, a PDF comes back a PDF with its images intact.
 *
 * Two outcomes:
 *  - NOTHING accepted (clean, or every span ignored) -> the ORIGINAL File
 *    object, byte-identical. There is no privacy reason to touch a file we are
 *    not changing, and no round trip is made.
 *  - ANYTHING accepted -> the backend's redacted file, in its original format.
 *
 * ⚠️ Keeping images is not cleaning them. A secret that exists only inside an
 * embedded photo or a scanned page survives this untouched -- coverage.not_read
 * says so in the review pane, and OCR is backlog (ADR 0027).
 */
export async function buildCleanedFile(
  held: HeldFile,
  decisions: SpanDecisionMap,
  numbering: SessionNumbering,
  deps: CleanedDeps = { redact: redactFile },
): Promise<File> {
  const findings = held.findings ?? [];
  if (findings.length === 0 || held.extract == null || held.extractSha256 == null) {
    return held.file;
  }

  const spans: RedactSpanPayload[] = [];
  for (const finding of findings) {
    const decision = decisions.get(spanKey(finding));
    if (decision?.kind !== 'accepted') continue;   // ignored spans stay as written
    spans.push({
      start: finding.start,
      end: finding.end,
      text: finding.text,
      placeholder: decision.placeholder || numbering.placeholderFor(finding.cls, finding.text),
    });
  }

  if (spans.length === 0) return held.file;

  // Throws on failure. Deliberately no fallback -- Task 13 surfaces it.
  return deps.redact(held.file, held.extractSha256, spans);
}
```

- [ ] **Step 4: Run the tests**

```bash
cd code/extension && npx vitest run tests/files/cleaned.test.ts
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add code/extension/src/files/cleaned.ts code/extension/tests/files/cleaned.test.ts
git commit -m "feat(ext): cleaned attachment builder - original bytes when unchanged, original format when masked"
```

---

### Task 13: Wire it together in the content script

**Files:**
- Modify: `code/extension/entrypoints/content.ts`
- Create: `code/extension/src/ui/file-chip.ts`
- Test: `code/extension/tests/files/gate-files.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 7–12.
- Produces: the running feature.

- [ ] **Step 1: Write `file-chip.ts`**

```ts
import type { HeldFile } from '../files/types';

/**
 * Our own attachment chip. The provider never rendered one because the
 * provider never received the file -- so this chip is the only signal the
 * user has that their attachment exists. It has to be unmissable.
 */
let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;

const LABEL: Record<string, string> = {
  held: 'Queued',
  extracting: 'Reading…',
  scanning: 'Checking…',
  scanned: 'Checked',
  error: 'Not checked',
  error_acknowledged: 'Sending anyway',
};

export function renderChips(files: HeldFile[], onRemove: (id: string) => void): void {
  if (files.length === 0) return clearChips();

  if (!host) {
    host = document.createElement('div');
    host.setAttribute('data-vanguard-ui', 'file-chips');
    host.style.cssText =
      'position:fixed;bottom:96px;left:50%;transform:translateX(-50%);z-index:2147483646';
    (document.body || document.documentElement).appendChild(host);
    root = host.attachShadow({ mode: 'open' });
  }

  root!.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'all:initial;display:flex;gap:8px;flex-wrap:wrap;font:13px Segoe UI,system-ui,sans-serif';

  for (const held of files) {
    const chip = document.createElement('div');
    const bad = held.status.kind === 'error';
    chip.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;' +
      `background:${bad ? '#fff7ed' : '#fff1f2'};border:1px solid ${bad ? '#fed7aa' : '#fecdd3'};` +
      `color:${bad ? '#7c2d12' : '#9f1239'};box-shadow:0 4px 12px rgba(15,23,42,.12)`;
    chip.textContent = `${held.file.name} — ${LABEL[held.status.kind]}`;

    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${held.file.name}`);
    remove.style.cssText = 'border:none;background:none;cursor:pointer;font-size:16px;color:inherit;padding:0 2px';
    remove.addEventListener('click', () => onRemove(held.id));
    chip.append(remove);
    wrap.append(chip);
  }

  root!.append(wrap);
}

export function clearChips(): void {
  host?.remove();
  host = null;
  root = null;
}

/**
 * Shown when /v1/redact fails on Proceed. The modal stays open behind it.
 *
 * This exists because the alternatives are both dishonest: attaching the
 * original leaks, and attaching a .txt silently changes the format the user
 * chose. Neither is a fallback -- they are two different ways of lying about
 * what happened (Global Constraint 15).
 */
export function showRedactionFailure(message: string): void {
  const banner = document.createElement('div');
  banner.setAttribute('data-vanguard-ui', 'redact-error');
  banner.setAttribute('role', 'alert');
  banner.style.cssText =
    'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'max-width:420px;padding:12px 16px;border-radius:8px;background:#7c2d12;color:#fff;' +
    'font:600 14px/1.45 system-ui;box-shadow:0 6px 20px rgba(15,23,42,.35)';
  banner.textContent = `${message} Nothing was attached.`;
  (document.body || document.documentElement).appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}
```

- [ ] **Step 2: Write the failing gate test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { FileStore } from '../../src/files/store';
import { installGate } from '../../src/gate/gate';
import { VerdictCache } from '../../src/detection/verdict-cache';

describe('the gate with files held', () => {
  it('blocks Send on a CLEAN prompt when a file is still scanning', async () => {
    const cache = new VerdictCache();
    const store = new FileStore();
    const id = store.add(new File(['x'], 'a.pdf'));
    store.update(id, { status: { kind: 'scanning' } });

    const onBlocked = vi.fn();
    await cache.setClean('h', []);

    installGate({
      cache,
      getComposerText: () => 'a clean prompt',
      isSendIntent: () => true,
      hashOf: () => 'h',
      approvedHash: () => null,
      filesResolved: () => store.allResolved(),
      onBlocked,
    });

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(onBlocked).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets a clean prompt through when there is no file', async () => {
    const cache = new VerdictCache();
    await cache.setClean('h', []);
    const onBlocked = vi.fn();

    installGate({
      cache,
      getComposerText: () => 'a clean prompt',
      isSendIntent: () => true,
      hashOf: () => 'h',
      approvedHash: () => null,
      filesResolved: () => true,
      onBlocked,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(onBlocked).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run and watch it fail**

```bash
cd code/extension && npx vitest run tests/files/gate-files.test.ts
```
Expected: FAIL — `installGate` has no `filesResolved` option, so the clean prompt is not blocked.

- [ ] **Step 4: Add `filesResolved` to the gate**

In `code/extension/src/gate/gate.ts`, add `filesResolved?: () => boolean` to the options type, and in the block decision add — **before** the verdict check, so a held file blocks even on a clean, approved prompt:

```ts
    if (options.filesResolved && !options.filesResolved()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void options.onBlocked(text);
      return;
    }
```

- [ ] **Step 5: Wire `content.ts`**

Add the imports:

```ts
import { installFileCapture } from '../src/files/capture';
import { attachFiles } from '../src/files/attach';
import { buildCleanedFile } from '../src/files/cleaned';
import { defaultDeps, processFile } from '../src/files/pipeline';
import { FileStore } from '../src/files/store';
import { clearChips, renderChips, showRedactionFailure } from '../src/ui/file-chip';
import { CLIENT_LIMITS } from '../src/files/config';
```

Inside `main()`, after `const numbering = new SessionNumbering();`:

```ts
    const files = new FileStore();

    files.subscribe(() => renderChips(files.list(), (id) => files.remove(id)));

    const scanText = (text: string) =>
      scanInto(new VerdictCache(), text, { l2TimeoutMs: CLIENT_LIMITS.fileScanTimeoutMs });

    installFileCapture({
      onFiles: (picked) => {
        for (const file of picked) {
          const id = files.add(file);
          // Scan starts at ATTACH, not at Send. By the time the user finishes
          // typing, the File pane is usually already populated -- the
          // progressive UI is a consequence of the interception, not extra work.
          void processFile(files, id, defaultDeps(scanText));
        }
      },
    });
```

Pass `filesResolved` into `installGate`:

```ts
      filesResolved: () => files.allResolved(),
```

Extend `onBlocked` so the modal opens even when the prompt is clean but a file is not:

```ts
      onBlocked: async (text) => {
        if (cache.getSync(hashes.get(text) ?? '') == null) await scan(text);
        const verdict = cache.getSync(hashes.get(text) ?? '');
        const promptDirty = verdict?.state === 'DIRTY';
        if (!promptDirty && files.allResolved()) return;

        showModal({
          text,
          findings: promptDirty ? verdict!.findings : [],
          numbering,
          files: files.list(),
          onAcknowledgeFileError: (id, reason) => {
            const held = files.get(id);
            if (!held || held.status.kind !== 'error') return;
            files.update(id, {
              status: { ...held.status, kind: 'error_acknowledged', reason },
            });
            // I3: the class and the reason, never the file bytes or its name.
            void recordIgnore(
              [{ cls: 'PERSON', start: 0, end: 0, text: '' }],
              `file_unchecked:${held.status.code}: ${reason}`,
            );
          },
          onProceed: async ({ finalText, ignored, files: fileResults }) => {
            for (const row of ignored) await recordIgnore([row.finding], row.reason);

            for (const result of fileResults) {
              const held = files.get(result.id);
              if (!held) continue;
              for (const row of result.ignored) await recordIgnore([row.finding], row.reason);
              if (held.findings?.length) await recordFindings(held.findings);
            }

            // 🔴 Redaction is a network round trip now (Task 5B), so this can
            // FAIL. It must not fail into "attach the original" (a leak) or
            // into "attach a .txt" (a surprise edit in a format nobody asked
            // for). It fails into "nothing is attached and you are told".
            const outgoing: File[] = [];
            try {
              for (const result of fileResults) {
                const held = files.get(result.id);
                if (!held) continue;
                outgoing.push(
                  await buildCleanedFile(held, held.decisions ?? new Map(), numbering),
                );
              }
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : 'Your files could not be prepared, so nothing was attached.';
              showRedactionFailure(message);
              return; // modal stays open; the user retries, removes the file, or edits
            }

            const input = adapter.fileInputs()[0];
            if (outgoing.length > 0 && input) attachFiles(input, outgoing);
            if (outgoing.length > 0 && !input) {
              // The provider's file input vanished (D4). Do NOT proceed as if
              // the attachment landed -- ADR 0014 degrades to advisory, and an
              // attachment silently dropped is worse than a visible failure.
              showRedactionFailure(
                "Vanguard couldn't attach the cleaned file to this page. Please reload " +
                  'the tab and attach it again.',
              );
              return;
            }

            adapter.writeText(finalText);
            const approvedText = adapter.readText() ?? finalText;
            const hash = await sha256Hex(approvedText);
            approvals.approve(hash, 60_000);
            hashes.set(approvedText, hash);
            void scan(approvedText);
            hints.update(approvedText);
            hideModal();
            // Files are handed off. Nothing readable outlives the send.
            files.clear();
            clearChips();
          },
        });
      },
```

🔴 **`files.clear()` is not cleanup — it is E2 applied to files.** Once the cleaned copy is attached, the extension holds no readable original. There is nothing left to write back into the provider's page.

- [ ] **Step 6: Run the full extension suite and the drift check**

```bash
cd code/extension && npx vitest run && npm run build && npm run check:dist
```
Expected: all tests pass; build succeeds; `check:dist` reports no drift.

- [ ] **Step 7: Commit**

```bash
git add code/extension
git commit -m "feat(ext): wire attach capture, file pipeline, chips and cleaned re-attach into the gate"
```

---

### Task 14: Manual acceptance on real ChatGPT and Claude

**Files:**
- Modify: `code/extension/ACCEPTANCE.md`
- Modify: `code/README.md`

**Interfaces:** consumes the whole build; produces the team-test script.

- [ ] **Step 1: Write the acceptance checklist into `ACCEPTANCE.md`**

Append a `## Slice 2 — file content checking` section. **Every row is run on BOTH chatgpt.com and claude.ai** — doc 05 §4.4: two adapters, breaking independently.

| # | Step | Expected |
|---|---|---|
| 1 | Start the API (`docker compose up` or the shared address in Options), open `/healthz` | `{"ok":true}` |
| 2 | Attach a clean `.txt`, type a clean prompt, press Send | No modal. Message sends with the original `.txt` attached. |
| 3 | Attach a `.docx` containing `880101-14-5566`, type a clean prompt | Our chip appears; **the provider's own upload chip does NOT**; chip goes `Reading…` → `Checking…` → `Checked` |
| 4 | Press Send | Review opens. **Prompt tab first**, File tab badged `1`. |
| 5 | Hover the underlined NRIC in the File tab | Why + recommendation + Accept + Ignore |
| 6 | Accept it, press Proceed | A chip for `<name>.redacted.docx` appears in the provider's composer — **still a .docx**. **The user presses Send.** |
| 7 | Download the attachment from the sent message and open it in Word | It opens as a normal Word document, **layout and any embedded images intact**, `880101-14-5566` replaced by `NRIC_1` |
| 7a | Repeat 3–7 with a **PDF** containing an image *(only if U30 passed)* | `<name>.redacted.pdf` opens in Acrobat without a repair prompt; the span is gone; the image is still there |
| 7b | Repeat with a **CSV** | `<name>.redacted.csv`, text masked |
| 7c | Stop the API **after** the review opens, then press Proceed | Red banner: nothing was attached. **The original is NOT attached and no `.txt` appears.** The modal stays open |
| 8 | Repeat 3–6 but **Ignore** the span with a reason | The **original** `.docx` is attached, byte-identical — check the file size matches the original |
| 9 | Attach a 20 MB file | Chip reads `Not checked`; review explains the 10 MB limit; **nothing was uploaded to either service** |
| 10 | Attach a scanned PDF | `no_text_layer` message, in plain language. **Never "no issues found."** |
| 11 | Attach a password-protected DOCX | `password_protected` message |
| 12 | Attach `tests/fixtures/zip_bomb.docx` | `suspicious_archive`; the API container stays up (`docker stats` shows memory flat) |
| 13 | Stop the API, attach a file | `network` message naming the Options page. **The prompt gate still works.** |
| 14 | With the API stopped, acknowledge the error with a reason and Proceed | The original file attaches; the reason is in `chrome.storage.local.vg_audit`; **the raw filename is not** |
| 15 | Attach a file, then press Send **immediately** (before `Checked`) | Send is blocked; File tab reads `Checking…`; Proceed is disabled; **the Prompt tab is fully usable meanwhile** |
| 16 | Drag-and-drop a `.pdf` onto the composer | Same as 3 |
| 17 | Paste an image from the clipboard | `unsupported_type`, clearly worded |
| 18 | Paste **text** into the composer | Unchanged Slice 1 behaviour — the prompt path is untouched |
| 19 | Attach two files at once | Two chips, two File tabs, both must be resolved before Proceed |
| 20 | Inspect `chrome.storage.local` after all of the above | `vg_audit` holds classes, counts, fingerprints and reasons. **No extract, no filename, no file bytes** |

- [ ] **Step 2: Record what the team should report back**

Add to `ACCEPTANCE.md`:

> **The most valuable output of this test is not pass/fail.** Per ADR 0017 §4 it is the **Ignore rate per class**, now extended to files. Run this in the DevTools console on either surface and paste the result into the team thread:
>
> ```js
> chrome.storage.local.get('vg_audit').then(r => console.table(
>   Object.entries((r.vg_audit||[]).reduce((acc,row)=>{
>     acc[row.cls] ??= {flagged:0, ignored:0};
>     row.ignored ? acc[row.cls].ignored++ : acc[row.cls].flagged++;
>     return acc;
>   },{})).map(([cls,v])=>({cls,...v}))
> ));
> ```
>
> **Also report, because these are the numbers Slice 2 exists to produce:** how long `Checking…` lasted for a typical work file *(this is U6-b's curve for the file path — the curve is ours; the threshold is still B3-blocked)*, and how often you hit `Not checked` and why.

- [ ] **Step 3: Update `code/README.md`'s order-of-operations table**

Mark Slice 2 as in progress, add the `u27-file-capture` spike row alongside the U12 and U21-a rows, and add `backend/` as **LIVE (extract only)** rather than STUB.

- [ ] **Step 4: Commit**

```bash
git add code/extension/ACCEPTANCE.md code/README.md
git commit -m "docs: Slice 2 acceptance checklist and scaffold status"
```

---

### Task 15: The two ADRs and the register entries

**Files:**
- Create: `docs/adr/0027-cleaned-extract-replaces-attachment.md`
- Create: `docs/adr/0028-backend-parses-extension-detects.md`
- Modify: `ASSUMPTIONS.md`, `CLAUDE.md`

- [ ] **Step 1: Write ADR 0027 — AMENDED 2026-07-18 by founder decision**

🔴 **The founder overruled the `.txt`-on-accept default before implementation started. Write the ADR to the amended shape below, not to the superseded one** — and record the superseded option as a rejected option so a fresh session does not re-derive it and mistake that for diligence.

**Title:** *Masks are applied to the original file; the extract is a decision surface, not the output.*

**Context.** Decision #8 means the user presses Send, so the file must be cleaned before it goes. The review UI shows an extracted readable copy because that is the only way to underline a span and offer Accept/Ignore. **The question this ADR settles is what happens to that text afterwards.**

**Options.**

| | Option | Verdict |
|---|---|---|
| **A** | Convert the reviewed extract into the outgoing file — `name.redacted.txt` | ❌ **Rejected (founder, 2026-07-18).** It is the cheap path and it was this plan's first draft. It hands a compliance officer a `.txt` where they attached a report: tables, headings and every image are gone, and the model's answer degrades for reasons the user cannot see. **We would be damaging the document in order to protect it.** |
| **B** | **Apply accepted masks onto the original bytes; return the same format** | ✅ **Chosen.** DOCX → DOCX with `word/media/` intact. PDF → PDF with image XObjects intact. CSV/TXT → text, because there is nothing else in them. |
| **C** | Block the send when a file is dirty | ❌ ADR 0014 — never fail-closed. Pushes the user to the desktop app (doc 00 §1.4). |

**Decision — B, with four rules.**

1. **Nothing accepted → the original `File` object, byte-identical.** No round trip, no rewrite, no degradation. There is no privacy reason to touch a file we are not changing.
2. **Anything accepted → `POST /v1/redact` with the original bytes + the accepted spans.** Output is the same format, renamed `name.redacted.<ext>`.
3. **The extract is hash-bound.** The redact call carries the extract's SHA-256; the backend re-parses and **refuses on mismatch**. Offsets reviewed against one parse are never applied against another.
4. 🔴 **Failure attaches nothing and says so.** Not the original (a leak), not a `.txt` (a surprise edit into a format nobody chose). **Both alternatives are ways of misreporting what happened**, and the audit trail saying it worked is the failure this whole product exists to prevent.

**The stated gaps — these belong in the UI, not only in this ADR.**

- 🔴 **Keeping images is not cleaning them.** A secret that exists only inside a photo, a screenshot, or a scanned page **ships untouched**. `coverage.not_read` renders *"N embedded images (kept as-is, not checked — no OCR)"* in the File pane. **OCR is backlog, not MVP.**
- 🔴 **PDF redaction removes every occurrence of an accepted span, not only the one the user hovered** — it locates by string search (U30). Over-redaction is the fail-safe direction, but it is a **semantic difference** and the UI must not imply per-span precision it does not have.
- **Pixel-identical layout is not promised.** The bar is **same format + images kept + accepted text masked**. A placeholder is a different length than the value it replaced, so reflow is expected.
- **CSV/TXT produce text because they are text.** That is not the option-A fallback returning by the back door.

**Consequences.** ~8–11 engineer-days over option A *(estimate)*, a second endpoint, an offset map through the DOCX parser, and a PDF library with a licence question (U30). **The original bytes are re-uploaded on Proceed** because the backend retained nothing (F4) — a real cost, and the right one.

**Revisit if:** U30 fails (→ founder chooses among licence / PDF-only `.txt` / defer), **or** the team reports that reflow after masking makes documents unusable — in which case in-place *style-preserving* rewriting is a scoped feature with evidence behind it rather than a guess.

- [ ] **Step 2: Write ADR 0028**

Title: **The backend parses; the extension detects.**
Record Pushback 2 in full: the four reasons, the re-read of ADR 0008's *"Why not A"* showing the parser attack surface — not detection — was the actual argument, the accepted cost (L2 over a full extract is seconds, on doc 06 §1's **soft** deadline), and the single place the plan changes if the founder overrules it.
🔴 **Include the honest note:** this makes the sales sentence *"parsed in-region, zero-retention; detection still on your machine"* — **which is stronger than what ADR 0008 promised, so do not quietly restate ADR 0008 as having said it.** ADR 0008 said files go to the cloud; this narrows *what* goes and *what happens there*.

- [ ] **Step 3: Add to `ASSUMPTIONS.md` §3**

- **U27** — an isolated-world `window`-capture listener intercepts file attachment (`change` / `drop` / `paste`) before the provider uploads, on ChatGPT and Claude. **Scope: two surfaces, one date, D4 clock.** Resolved by Task 1.
- **U28** — setting `input.files` from a synthesized `DataTransfer` causes the provider to accept and upload our file. Resolved by Task 1.
- **U30** — accepted spans can be located and **removed** from a real PDF's text layer, images preserved, output opens cleanly. **Includes the licensing position, which is part of the verdict.** Resolved by Task 1B.
- **U29** — the providers upload attachments **on attach rather than on send**. 🔴 **This is Pushback 1's premise and it is currently `[unverified]`.** Task 1 step 3's Network-tab observation resolves it. **If U29 is FALSE, Slice 2 could have gated at Send and the interception is over-engineering** — record that outcome honestly rather than keeping the mechanism because it was built.

- [ ] **Step 4: Update `CLAUDE.md`**

Deliverable row 12 → in progress with a pointer to this plan. Add ADRs 0027 and 0028 to the §2 ADR list. Add a line to §8's sequence noting Slice 2 has **two** stop conditions — **U27** (attach interception, the same shape U12 was for Slice 1) and **U30** (PDF redaction, founder-gated) — and that **ADR 0027's amended form, not its first draft, is binding**: the extract is a decision surface and masks are applied to the original file.

- [ ] **Step 5: Verify every cross-reference in the new ADRs**

```bash
cd "C:/Jeff/UM AI/Y1 Sem break/HackAttack" && grep -n "^#\{1,4\} " docs/02-privacy-architecture.md | grep -E "4\.3|6\.2"
```

🔴 **CLAUDE.md §5's standing rule: every cross-reference is an assertion.** Six of the §7.3 Source cells were wrong when written, each *"off by a plausible amount, in the right document, in a direction nobody would question."* Confirm each section number these ADRs cite actually carries the claim — re-read the target, not your memory of it.

- [ ] **Step 6: Commit**

```bash
git add docs ASSUMPTIONS.md CLAUDE.md
git commit -m "docs: ADRs 0027-0028 and the U27/U28/U29 register entries for Slice 2"
```

---

## Timeline

| Task | Engineer-days *(estimate)* |
|---|---|
| 1 — U27 spike | 1–2 |
| **1B — U30 PDF-redaction spike** 🔴 **new** | **1–2** |
| 2 — API contract | 0.5 → **1** *(redact models, offset map, validators)* |
| 3 — Safety layer | 1.5–2 |
| 4 — Parsers | 2–3 → **3–4** *(the DOCX offset map and its two guard tests)* |
| 5 — Endpoint + F4 tests | 1.5–2 |
| **5B — `/v1/redact`: DOCX OOXML rewrite + PDF redaction** 🔴 **new** | **4–6** *(≈2–3 DOCX, ≈2–3 PDF)* |
| 6 — Docker + README | 0.5–1 |
| 7 — Types + store | 0.5 |
| 8 — Capture + attach | 2–3 |
| 9 — API client + options | 1 |
| 10 — Pipeline | 1 |
| 11 — Tabbed review UI | 3–4 |
| 12 — Cleaned attachment | 0.5–1 |
| 13 — Content-script wiring | 2–3 |
| 14 — Manual acceptance | 1 → **1.5** *(round-tripping real DOCX/PDF through Word and Acrobat)* |
| 15 — ADRs + register | 0.5 |
| **Total** | **27–37 engineer-days ≈ 5.5–7.5 weeks, one engineer** *(estimate)* |

🔴 **The format-preserving amendment costs ~8–11 engineer-days — roughly a 40% increase — and it is worth stating why rather than burying it.** The previous `.txt` output needed no offset map, no second endpoint, no OOXML surgery and no PDF library. **This is not scope creep; it is the difference between a demo and a thing people would use** — a compliance officer who receives `payroll.docx.redacted.txt` learns that the tool damages documents. **But it is real time and the founder should see the delta, not just the total.**

⚠️ **The PDF half (~2–3 days inside Task 5B, plus Task 1B) is the part most likely to be wrong**, and it is the only line item gated on an external library's behaviour. **If U30 fails, Task 5B drops to ~2–3 days and the total lands near 23–31 days** — with a founder decision attached, not a silent descope.

🔴 **This does not contradict doc 00 §1.7, and the difference is the whole argument for the thin v1.** §1.7 prices *"pdf, docx, xlsx, pptx, csv, txt, md, code, images/scans, zip"* at **"a 6-month project with a dedicated engineer"** and calls files **"Phase 1's *dominant* cost, not an increment"** at A1 headcount. **That verdict stands and this plan does not dispute it.** 4–5 weeks buys **four formats, one text layer, no OCR** — roughly the cheapest honest slice of §1.7's sentence. **The remaining months are in the Backlog, not deleted.** Anyone reading this timeline as *"file scanning takes a month"* has read it wrong.

**No comparable build exists to cite, so this is an estimate in the same sense Slice 1's ~18–26 days was** — and that one is now a checkable prediction rather than a guess, so **compare against Slice 1's actual before trusting this number.**

🔴 **The two line items that could blow it, both measurements rather than guesses:**
1. **Task 1 (U27).** If interception fails on either surface, this plan's shape is wrong. It is 1–2 days to find out and it is deliberately first.
2. **Task 11.** Retrofitting a tab model into a modal built for one pane is the kind of work that looks like a day and is four. The mitigation is that `send-review-logic.ts` is genuinely reusable — verified in Task 11 by running its existing test file unchanged.

---

## Risks

| # | Risk | Why it is real | What the plan does |
|---|---|---|---|
| **1** 🔴 | **U27 fails — the provider uploads before our listener sees the file** | This is the plan's premise and it is **unverified**. The keydown analogue held (U12), but a `change` event is not a `keydown` event and the provider may use a `File System Access` picker rather than an `<input>` at all. | Task 1 is a standalone spike with a **stated stop condition**. Do not build around a failure. |
| **2** 🔴 | **A clean extract is presented as a clean file** | Pushback 3. Scanned pages, embedded objects, XFA form fields and image content are all invisible to a text parser. | `coverage.not_read` is rendered in the review pane; a zero-text PDF is a hard **error**, never a clean pass. **This is a disclosure, not a fix — say so.** |
| **3** 🔴 | **F4 degrades to short retention through a framework default** | Starlette's `UploadFile` spools to disk above 1 MB. Nobody would notice. Doc 02 §4.3 predicted this exact class of failure. | Task 5 reads the raw stream under a cap; `test_zero_retention.py` fails if a temp file appears; the container is `read_only` with a 16 MB tmpfs. |
| **4** 🟠 | **The adapters break on the D4 clock** | Slice 1 already carries this; Slice 2 **doubles the surface** — the composer selector *and* the file-input selector, breaking independently. | `fileInputs()` re-queries on every call and is marked `[verify against the live DOM]`. **A missing file input must degrade to advisory (ADR 0014), never silently drop the attachment** — verify this in Task 14 by deleting the input in DevTools. |
| **5** 🟠 | **Local-API friction kills the team test** | *"Clone → Load unpacked"* was Slice 1's whole acceptance property. Adding Docker to it loses testers. | Options page + a founder-hosted shared instance as the primary path, Compose as fallback. **Task 6 names this as a recommendation, not a technical fact.** |
| **6** 🔴 | **U30 fails — PDF text cannot be reliably removed in place** | There is no documented offset→content-stream mapping; PyMuPDF's search-and-redact is the only mature route and it is **AGPL or commercial**, which is a licensing decision nobody has made. | **Task 1B is a spike with a founder-gated stop.** Three named options on failure. 🔴 **`.txt` fallback is one of them and it is not the default** — Global Constraint 15. |
| **6a** 🟠 | **Redaction succeeds and the text survives anyway** | U30's fatal mode: the annotation is applied, the API returns success, and `get_text()` still finds the span. **The mechanism reports success and the file is not masked** — ledger #11's exact shape. | `redact_pdf` **re-reads its own output** and raises if any span is still present. A verdict about an output is checked against the output. |
| **6b** 🟠 | **PDF redaction removes every occurrence, not the reviewed one** | `search_for` is a string search. Over-redaction is fail-safe for privacy but is a **semantic difference** from what the user hovered. | Documented in `redact/pdf.py` and in ADR 0027. **Not hidden, not "fixed" by clever heuristics.** |
| **6c** 🟠 | **Users assume "images kept" means "images checked"** | It does not, and the gap is exactly where a photographed IC or a scanned payslip lives. | `coverage.not_read` says *"kept as-is, not checked — no OCR"* in the File pane. **ADR 0027 carries it as a stated gap.** |
| **7** 🟠 | **Stock NER over-fires far worse on a file than on a prompt** | A 100 000-character extract with hundreds of PERSON/ORG hits produces a review pane nobody can work through. **This is ADR 0017 §1's known weakness, scaled by three orders of magnitude.** | 🔴 **The plan does NOT invent a sensitivity heuristic to fix it** — ADR 0017's consequence forbids exactly that. It ships and it is **measured** via Ignore-rate-per-class. **If the File pane is unusable, that is the strongest possible argument for the ADR 0018 trained model, and it will be a number rather than an opinion.** |
| **8** 🟡 | **XLSX will be asked for on day one** | It is the most common carrier of the exact data this product exists to stop. | It is backlog #1 with the reason stated (extract legibility, not parser difficulty). **Task 3 gives it a specific, helpful error rather than a generic one.** |
| **9** 🟡 | **`files.clear()` on Proceed loses a file the user wanted to re-send** | If the provider rejects the attachment, the extension no longer holds it. | Accepted for the MVP: E2's reasoning is that a held readable copy is a liability. **Named here so it is a decision, not a bug report.** |

---

## Backlog — after Slice 2

Ordered. Each is deliberately out of the MVP.

1. **XLSX** — 🔴 **backlog #1, explicitly deferred, not cut.** Extraction plus a table-shaped review pane plus sheet-aware redaction. **The pane is the work, not the parser.** In v1 an XLSX gets a specific, helpful `unsupported_type` message (Task 3) that names the workaround — never a generic refusal, and never a silent skip.
2. **PPTX** — rides the OOXML machinery from Tasks 4 and 5B; slide-boundary labelling and `ppt/media/` preservation.
3. **OCR** (scanned PDF, JPG, PNG) — a separate infrastructure decision: engine, cost, latency, U7. **The one backlog item that cannot ride Slice 2's shape**, and the one that closes ADR 0027's *"keeping images is not cleaning them"* gap.
4. **Style-preserving reflow** — DOCX and PDF masking now ship in-format (ADR 0027), but a placeholder is a different length than the value it replaced, so layout reflows. **Pixel-stable output is the remaining half** and it is ADR 0027's revisit trigger.
5. **Report** — ADR 0026, explicitly after Slice 2. ⚠️ **And ADR 0026's own warning applies to the file path too: Report must not become a silent suppress-list on re-upload.** A "don't flag this again" control is a **separate design**, and conflating them fails open on true positives the user meant to fix and never did.
6. **The log-only send observer** for the file path — ADR 0017 §6.2 deferred it past Slice 1; it deferred past Slice 2 too, and the file path gives it a second thing to reconcile.
7. **Residency** — `ap-southeast-5` deployment. **U17 (per-service availability) must be verified before Phase 1 is sized** and is still unverified.
8. **Per-tenant DEKs on the backend** (ADR 0009) — not needed for a stateless extract service that stores nothing, and **saying that plainly is better than scaffolding crypto with no data to protect.** It becomes real the moment anything is persisted.

---

## Self-review

**Spec coverage.** Every founder-locked item maps to a task: privacy/posture → Tasks 5, 5B, 6, 10 · UX steps 1–10 → Tasks 8, 10, 11, 12, 13 (step 4 progressive UI falls out of Task 8's attach-time scan; step 9 is `canProceed`; step 10 is decision #8, untouched) · architecture → Tasks 2–6, 9 · formats → Tasks 4, 5B · limits → Tasks 2, 9 · security → Tasks 3, 5 · **format-preserving redaction → Tasks 1B, 2, 4, 5B, 12, and the amended ADR 0027** · out-of-scope items → none implemented, all in Backlog.

**Locked answers reflected:** `/extract` not `/scan` (Pushback 2, ADR 0028) ✅ · founder-hosted API primary with Compose fallback and a plain-language tester note (Task 6) ✅ · attach-time intercept with a hard stop (Task 1) ✅ · coverage disclosure (Tasks 4, 11) ✅ · commit authorship with no AI trailer (Global Constraint 14) ✅ · XLSX as backlog #1 with a specific error, not a silent cut (Task 3, Backlog) ✅.

**Placeholder scan.** No TBDs. Two intentional `[verify against the live DOM]` markers on selectors (doc 05 §3.1). One intentionally gated task: `redact/pdf.py` is not written until U30 passes, and the gate is stated at the top of Task 5B rather than left as an assumption.

**Type consistency.** `ExtractResult` is a **4-tuple** in all three parsers (Task 4) and unpacked as one in Tasks 5 and 5B. `NodeRef` is defined once in `parsers/text.py` and consumed by `parsers/docx.py` and `redact/docx.py`. `extract_sha256` (Python) ↔ `extract_sha256` (wire) ↔ `extractSha256` (`HeldFile`) — **the one deliberate casing change, at the JSON boundary, and it appears in Tasks 2, 7, 9, 10 and 12 consistently.** `buildCleanedFile` is `Promise<File>` in Task 12 and `await`ed in Task 13. `RedactSpanPayload` (TS) mirrors `RedactSpan` (Pydantic) field-for-field.

**Slice 1 reuse, unchanged.** `Finding`, `SpanDecisionMap`, `spanKey`, `initDecisions`, `allResolved`, `pendingCount` are consumed with their existing Slice 1 signatures throughout. `ExtractResponse` / `RedactRequest` are defined once in `app/models.py` and mirrored once in `src/files/types.ts` — **the one place two languages describe the same object, and ADR 0007's codegen path is the eventual fix.** `HeldFile.decisions` is `SpanDecisionMap` in Task 7 and consumed as such in Tasks 10, 11 and 12. `attachFiles(input, files)` matches its call site in Task 13.

⚠️ **One reuse was DROPPED by the amendment and it is worth naming so nobody re-adds it:** `buildFinalText` no longer builds the outgoing file — it still drives the **preview** in the review pane (Task 11), but the outgoing bytes come from `/v1/redact`. **Two functions that used to be one.** If a future change makes the preview and the redaction disagree, that is the drift to look for.
