# Slice 1 acceptance — run on chatgpt.com AND claude.ai

**Status: CHECKLIST WRITTEN — LIVE RUN DEFERRED TO TEAM TEST**

This document is the Slice 1 acceptance definition (doc 05 §1.2 visual criterion requires a human browser). There is no CI workflow yet: `npm run build`, `npm run test`, and `npm run check:dist` must be run locally and their output recorded. All live checkboxes below remain unchecked until the founder's team completes a manual session on both surfaces.

Run every section on **both** `https://chatgpt.com` and `https://claude.ai`. Mark each box only after observing the criterion on that surface.

---

## Setup
- [ ] `npm run build && npm run test && npm run check:dist` — local gates pass and dist is in sync
- [ ] Load `dist/chrome-mv3` unpacked (Developer mode)
- [ ] First use downloads + hash-verifies weights once (watch the SW console for the verify log)

## The real flow (REAL chapters 1-4 of the chronology)
- [ ] Type `Please call Ahmad about the deal.` → the send is blocked; the modal shows PERSON: 1 and the rewrite `Please call PERSON_1 about the deal.`
- [ ] Approve → the composer now holds the rewrite, caret at end, focus in the composer
- [ ] Press Enter (or click Send) yourself → the message sends (the token matches; the gate does not stop it)
- [ ] Paste `IC 890101-14-5555 and email me at a@b.com` → blocked; modal shows NRIC: 1, EMAIL: 1
- [ ] Type `explain Einstein's theory` → blocked (stock NER PERSON); Ignore-with-reason "public figure" → sends unrewritten. **This FP is expected and is the measurement (ADR 0017 §Consequences).**
- [ ] Type `what is 1 + 1` → NOT blocked (the guardrail holds)
- [ ] Compose in Chinese via Microsoft Pinyin → Enter commits candidates normally; only a send-intent Enter is gated (U12-b)
- [ ] Kill the offscreen document (chrome://extensions → inspect → close) mid-session → next send degrades to advisory ("protection degraded"), does NOT hang (ADR 0014)

## The invariants (must all hold)
- [ ] No network request carries prompt text (DevTools → Network, filter by your typed string → zero hits except the model CDN on first run)
- [ ] `chrome.storage.local` contains NO raw names/NRICs — only classes, counts, salted fingerprints (Application tab)
- [ ] The original value is never written back into the page after a rewrite (E2)
- [ ] On a second machine, the same name gets `PERSON_1` independently — there is no shared/synced map (trivially true: no backend)

---

## Residual risks — verify live (carry-forward from Tasks 3, 8, 12, 13)

These augment the checklist above; they do not replace any brief item.

### R1 — ORT threaded WASM without COOP/COEP (Task 3)
- [ ] On first scan after load, L2 initializes in the offscreen document (SW console: no fatal ORT init error). Extension uses threaded WASM with `numThreads=1` and does **not** rely on COOP/COEP headers from the provider page.
- [ ] If L2 fails to initialize, the next send **degrades to advisory** ("protection degraded") and does **not** hang or fail-closed (ADR 0014).

### R2 — Hash-pinned first-run weight fetch (Task 3)
- [ ] First use on a clean profile: weights download from the public CDN once, hash verification succeeds (SW/offscreen console log), and subsequent scans reuse the cached artifact without re-download.
- [ ] Tamper test (optional): corrupt the cached blob → reload → verify fails safe to advisory, not silent clean.

### R3 — `messages.ts` CLS/SEP comment (Task 3, non-blocking)
- [ ] **Skip or note only:** a comment in `messages.ts` overstates whether `[CLS]`/`[SEP]` tokens reach `attachCharOffsets` (filtered upstream). Cosmetic; does not affect acceptance.

### Task 8 — Adapter selectors on live DOM
- [ ] Composer binding succeeds on chatgpt.com (content script finds composer; typing/paste events reach the gate).
- [ ] Composer binding succeeds on claude.ai (same).
- [ ] Send-button click path is intercepted on both surfaces (not Enter-only).
- [ ] `writeText` after Approve updates the visible composer without auto-submitting (decision #8).

### Task 12 minors — UX edge cases inherited from wiring
- [ ] **Cold-cache CLEAN paste → Send:** paste clean text, press Send immediately (cache still cold). Expect the first keypress may be swallowed with no modal; a **second** Send press is required. This is fail-safe, not fail-open — document if observed.
- [ ] **Approve → Send hash round-trip:** after Approve on a DIRTY prompt, press Send once. The approval token is minted from the composer's post-`writeText` value, so the gate's `innerText` round-trip must match. Verify one Send after Approve on both surfaces; note any mismatch.

### Task 13 — Cross-tab audit storage (note only, not blocking)
- [ ] **Note:** concurrent tabs can race on `chrome.storage.local` audit writes (module-local locks cover same-tab only; SW single-writer deferred). Acceptable for team test; flag if duplicate or lost audit rows appear under heavy multi-tab use.

---

## Sign-off

| Surface | Tester | Date | Pass / Fail | Notes |
|---------|--------|------|-------------|-------|
| chatgpt.com | | | | |
| claude.ai | | | | |

**Slice 1 accepted when:** all Setup + Real flow + Invariants boxes are checked on **both** surfaces, residual risks R1/R2/Task 8/Task 12 minors are verified or explicitly noted, and sign-off is recorded.

---

## Slice 1.5 — L1 Grammarly-while-typing (ADR 0024)

**Status: IMPLEMENTED — LIVE RUN DEFERRED_MANUAL**

Unit coverage: `tests/hint-logic.test.ts` (L1-only, Accept one span, Dismiss prune, arithmetic guardrail). Gate UI skip: `tests/gate.test.ts`. Live boxes below need a human on both surfaces.

On ChatGPT **and** Claude:

- [ ] Type/paste an IC or email → rose underline appears; Send is **not** blocked by the tip alone
- [ ] Hover → popover with class + recommendation; Accept → that span becomes `NRIC_1` / `EMAIL_1`; can still edit
- [ ] Dismiss → underline gone for that span until the span text changes
- [ ] Press Send with remaining L1/L2 hits → **existing modal** still hard-gates
- [ ] Ignore-with-reason in modal types correctly on Claude (Enter in the reason field is not treated as Send)

### Phase 4 — Send-time per-span review (ADR 0025) — IMPLEMENTED

- [ ] Enter on dirty prompt → **Review before send** popup (not bulk Approve modal)
- [ ] Sensitive spans underlined rose/red; hover → why + recommendation + Accept / Ignore
- [ ] Ignore requires a reason; Proceed disabled until every span is Accept or Ignore
- [ ] Accept all → masks all + Proceed (composer updated; you press Send)
- [ ] Ignore field keystrokes stay in the popup (not the Claude/ChatGPT composer)
- [ ] Typing underlines (Slice 1.5) still L1-only and never block Send

---

## Slice 2 — file content checking

**Status: IMPLEMENTED — AUTOMATED GATES GREEN · LIVE BROWSER RUN PENDING (FOUNDER/TEAM)**

Run every manual row below on **both** `https://chatgpt.com` and `https://claude.ai`. Do not mark a live checkbox until you observe the criterion on that surface. **No agent or CI run has performed these browser steps** — unchecked boxes are intentional.

**Prerequisites:** `docker compose up` in `code/backend/` (or the API base URL set on the extension Options page) · Slice 1 acceptance still applies to the prompt path.

### Automated gates (already green — re-run locally before the live session)

| Gate | Command | Last verified | Notes |
|---|---|---|---|
| Extension unit + integration | `cd code/extension && npm run test` | 2026-07-19 | **145 passed** — includes `tests/files/*`, `tests/ui/review-panes.test.ts`, `tests/modal.test.tsx` (File tab), `tests/gate-files.test.ts` |
| Committed dist matches src | `cd code/extension && npm run check:dist` | 2026-07-19 | ADR 0017 §3 |
| Backend contract + safety | `cd code/backend && python -m pytest -q` | 2026-07-19 | **39 passed** — parsers, zip-bomb guard, `no_text_layer`, redact hash-mismatch, format-preserving DOCX/PDF/CSV |

These gates cover **mechanism and contract**, not provider UX. Passing them does **not** substitute for the live checklist below.

### Live acceptance checklist

**Legend:** **PENDING** = founder/team must run on real ChatGPT + Claude · **CONDITIONAL** = run only when the named register entry is fully closed.

| # | Step | Expected | chatgpt.com | claude.ai |
|---|---|---|---|---|
| 1 | Start the API (`docker compose up` or the shared address in Options), open `/healthz` | `{"ok":true}` | PENDING | PENDING |
| 2 | Attach a clean `.txt`, type a clean prompt, press Send | No modal. Message sends with the original `.txt` attached. | PENDING | PENDING |
| 3 | Attach a `.docx` containing `880101-14-5566`, type a clean prompt | Our chip appears; **the provider's own upload chip does NOT**; chip goes `Reading…` → `Checking…` → `Checked` | PENDING | PENDING |
| 4 | Press Send | Review opens. **Prompt tab first**, File tab badged `1`. | PENDING | PENDING |
| 5 | Hover the underlined NRIC in the File tab | Why + recommendation + Accept + Ignore | PENDING | PENDING |
| 6 | Accept it, press Proceed | A chip for `<name>.redacted.docx` appears in the provider's composer — **still a .docx**. **The user presses Send.** | PENDING | PENDING |
| 7 | Download the attachment from the sent message and open it in Word | It opens as a normal Word document, **layout and any embedded images intact**, `880101-14-5566` replaced by `NRIC_1` | PENDING | PENDING |
| 7a | Repeat 3–7 with a **PDF** containing an image | `<name>.redacted.pdf` opens in Acrobat without a repair prompt; the span is gone; the image is still there | **CONDITIONAL — U30 real-corpus PASS still pending** ([ASSUMPTIONS.md](../../ASSUMPTIONS.md) U30) | same |
| 7b | Repeat with a **CSV** | `<name>.redacted.csv`, text masked | PENDING | PENDING |
| 7c | Stop the API **after** the review opens, then press Proceed | Red banner: nothing was attached. **The original is NOT attached and no `.txt` appears.** The modal stays open | PENDING | PENDING |
| 8 | Repeat 3–6 but **Ignore** the span with a reason | The **original** `.docx` is attached, byte-identical — check the file size matches the original | PENDING | PENDING |
| 9 | Attach a 20 MB file | Chip reads `Not checked`; review explains the 10 MB limit; **nothing was uploaded to either service** | PENDING | PENDING |
| 10 | Attach a scanned PDF | `no_text_layer` message, in plain language. **Never "no issues found."** | PENDING | PENDING |
| 11 | Attach a password-protected DOCX | `password_protected` message | PENDING | PENDING |
| 12 | Attach `code/backend/tests/fixtures/zip_bomb.docx` | `suspicious_archive`; the API container stays up (`docker stats` shows memory flat) | PENDING | PENDING |
| 13 | Stop the API, attach a file | `network` message naming the Options page. **The prompt gate still works.** | PENDING | PENDING |
| 14 | With the API stopped, acknowledge the error with a reason and Proceed | The original file attaches; the reason is in `chrome.storage.local.vg_audit`; **the raw filename is not** | PENDING | PENDING |
| 15 | Attach a file, then press Send **immediately** (before `Checked`) | Send is blocked; File tab reads `Checking…`; Proceed is disabled; **the Prompt tab is fully usable meanwhile** | PENDING | PENDING |
| 16 | Drag-and-drop a `.pdf` onto the composer | Same as row 3 | PENDING | PENDING |
| 17 | Paste an image from the clipboard | `unsupported_type`, clearly worded | PENDING | PENDING |
| 18 | Paste **text** into the composer | Unchanged Slice 1 behaviour — the prompt path is untouched | PENDING | PENDING |
| 19 | Attach two files at once | Two chips, two File tabs, both must be resolved before Proceed | PENDING | PENDING |
| 20 | Inspect `chrome.storage.local` after all of the above | `vg_audit` holds classes, counts, fingerprints and reasons. **No extract, no filename, no file bytes** | PENDING | PENDING |

### What the team should report back

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

### Sign-off

| Surface | Tester | Date | Pass / Fail | Notes |
|---------|--------|------|-------------|-------|
| chatgpt.com | | | | |
| claude.ai | | | | |

**Slice 2 accepted when:** all automated gates pass locally, every **PENDING** row above is checked on **both** surfaces (row **7a** only after U30 real-corpus PASS), and sign-off is recorded.
