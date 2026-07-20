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

### Span repair — check the masked span includes the honorific (added 2026-07-19)

The stock NER proposes `Rahman`; doc 04 §4.3 requires the title **inside** the masked span, or
`Encik ____` is left in the prompt as a re-identification pointer. Span repair fixes that, and
these boxes are how you confirm it is running.

- [ ] Type `Tolong ingatkan Encik Rahman pasal mesyuarat.` → the rewrite masks **`Encik Rahman`**, not just `Rahman`. **If you see `Encik PERSON_1`, repair is not running.**
- [ ] Type `Please update Mr. John Doe on the invoice.` → masks **`Mr. John Doe`**, not `John Doe`
- [ ] Type `请联系林女士确认订单。` → masks **`林女士`**, not `林`
- [ ] Type `我们公司欠阿里巴巴一笔服务费。` → `阿里巴巴` is masked as **one** span, not split
- [ ] Type `Kasir Rahman sudah balik.` → masks **`Rahman`** only — `Sir` must NOT be pulled out of `Kasir`
- [ ] Type `Ask Alice about the report.` → masks `Alice` unchanged (no title, nothing to expand)

> Measured on this pipeline over 265 gold MASK spans: full-span coverage **64.2% → 91.7%** with
> repair and the org dictionary, Chinese **44.8% → 88.1%**. ~8% still misses — the NER proposes
> nothing at all for some entities, which no rule can recover.

### Org dictionary — OFF unless you load one

Inert by default (`loadOrgTerms()` returns `[]`), so skip this section unless testing it.

- [ ] With an empty dictionary, behaviour is unchanged from the boxes above
- [ ] Load terms, then type a sentence naming one the NER usually misses (`Tolong bayar bil tertunggak TNB.`) → **`TNB` is masked**
- [ ] Type `I ate an apple a day` with `Apple` in the dictionary → **NOT blocked** (exact match is case-sensitive; this is the precision guarantee ADR 0004 exists for)

> ⚠️ `chrome.storage.local` is a Slice 1 placeholder. ADR 0009 puts the real dictionary on
> `chrome.storage.managed` with per-tenant DEKs — a local, unencrypted, user-writable list is
> fine for a team test and is not fine for a tenant's counterparty list.
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

**Status: CORE LIVE PATH PASSED (2026-07-19) · EDGE ROWS STILL OPEN · EDIT-MESSAGE DEFERRED**

Run every manual row below on **both** `https://chatgpt.com` and `https://claude.ai`. Do not mark a live checkbox until you observe the criterion on that surface.

**Prerequisites:** local `uvicorn` / `docker compose` in `code/backend/` (or the API base URL on Options) · Slice 1 acceptance still applies to the prompt path.

### Automated gates (already green — re-run locally before the live session)

| Gate | Command | Last verified | Notes |
|---|---|---|---|
| Extension unit + integration | `cd code/extension && npm run test` | 2026-07-19 | **154 passed** — files, review panes, oversized dialog, gate-files |
| Committed dist matches src | `cd code/extension && npm run check:dist` | 2026-07-19 | ADR 0017 §3 |
| Backend contract + safety | `cd code/backend && python -m pytest -q` | 2026-07-19 | **39 passed** — parsers, zip-bomb guard, redact, format-preserving |

These gates cover **mechanism and contract**, not provider UX. Passing them does **not** substitute for the live checklist below.

### Live acceptance checklist

**Legend:** **PASS** = founder observed on that surface · **PENDING** = not yet run · **DEFERRED** = known gap, not blocking this merge · **CONDITIONAL** = blocked on a named register entry.

| # | Step | Expected | chatgpt.com | claude.ai |
|---|---|---|---|---|
| 1 | Start the API (`uvicorn` / compose or shared Options URL), open `/healthz` | `{"ok":true}` | **PASS** | **PASS** |
| 2 | Attach a clean `.txt`, type a clean prompt, press Send | Review may open (all clean) → Proceed → Send; LLM receives the file | **PASS** | **PASS** |
| 3 | Attach a `.docx` containing `880101-14-5566`, type a clean prompt | Our chip appears; provider does not keep the dirty original; `Reading…` → `Checking…` → `Checked` | **PASS** | **PASS** |
| 4 | Press Send | Review opens. **Prompt** tab first, File tab badged | **PASS** | **PASS** |
| 5 | Hover the underlined NRIC in the File tab | Why + recommendation + Accept + Ignore | **PASS** | **PASS** |
| 6 | Accept it, press Proceed | `.redacted.docx` (or equivalent) attached; **user presses Send** | **PASS** | **PASS** |
| 7 | Download the attachment and open in Word | Opens; IC masked | PENDING | PENDING |
| 7a | PDF + image redaction | Image preserved, span gone | **CONDITIONAL — U30 real corpus** | same |
| 7b | CSV masked | `.redacted.csv` | PENDING | PENDING |
| 7c | Stop API after review, Proceed | Red banner; nothing attached | PENDING | PENDING |
| 8 | Ignore span with reason | Original `.docx` re-attached | PENDING | PENDING |
| 9 | Attach file **> 10 MB** | Immediate oversize dialog; Proceed = attach unchecked; Don't attach = discard | **PASS** | **PASS** |
| 10 | Scanned PDF | `no_text_layer`, never "all good" | PENDING | PENDING |
| 11 | Password-protected DOCX | `password_protected` | PENDING | PENDING |
| 12 | `zip_bomb.docx` fixture | `suspicious_archive` | PENDING | PENDING |
| 13 | API stopped, attach file | `network` message; prompt gate still works | PENDING | PENDING |
| 14 | Acknowledge unchecked + Proceed | Original attaches; audit has reason, not raw name | PENDING | PENDING |
| 15 | Send before `Checked` | Blocked; File tab `Checking…` | PENDING | PENDING |
| 16 | Drag-and-drop PDF | Same as row 3 | PENDING | PENDING |
| 17 | Paste image | `unsupported_type` | PENDING | PENDING |
| 18 | Paste text into composer | Slice 1 prompt path unchanged | **PASS** | **PASS** |
| 19 | Two files at once | Two chips / tabs | PENDING | PENDING |
| 20 | `chrome.storage.local` `vg_audit` | Classes/counts/fps only — no extract/filename/bytes | PENDING | PENDING |
| 21 | Edit prior user message + paste NRIC + Save | Same review on the **edit** editor | **DEFERRED** | **DEFERRED** |

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
| chatgpt.com | JeffTiong1031 | 2026-07-19 | **Pass (core)** | Rows 1–6, 9, 18. Edge PENDING. Edit-message **DEFERRED**. |
| claude.ai | JeffTiong1031 | 2026-07-19 | **Pass (core)** | Same. |

**Slice 2 team-test merge bar (this branch):** automated gates green + core live path (1–6, 9, 18) on both surfaces. Full checklist (7–8, 10–17, 19–20) and edit-message (21) remain follow-ups; U30 real-corpus still gates 7a.
