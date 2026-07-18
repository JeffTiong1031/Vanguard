# Slice 1 — Whole-Branch Code Review

**Reviewer:** Senior Code Reviewer (pre-merge)
**Branch:** `slice-1-chat-text-extension`
**Range:** `5dbfd8d` (merge-base) → `176e46b`
**Date:** 2026-07-18
**Scope:** read-only review against `docs/superpowers/plans/2026-07-18-slice-1-chat-text-extension.md`, ADRs 0013/0014/0016/0017, and CLAUDE.md §8.

---

## Overall verdict: **Ready with residuals**

The real path is built to plan: WXT scaffold + committed `dist/` + drift check, hash-pinned transformers.js NER in an offscreen document, L1 detectors with the `1+1` guardrail, a synchronous `window`-capture gate, ChatGPT + Claude adapters, in-memory numbering + placeholder rewrite, a Preact shadow-root modal with Ignore-with-reason, a single-use hash-bound approval token, and a salted-hash audit. **Every privacy/security invariant that could have leaked data holds** (no raw values persisted, no rehydration, on-device only, minimal manifest, weights fail-closed on hash mismatch). Authorship is clean: all 21 commits are `JeffTiong1031 <jefftiong1031@gmail.com>`, zero `Co-Authored-By` trailers.

It is **not blocked for the team test on any security/privacy ground.** Two items should be fixed before the team loads it, and a handful of live-verify residuals are inherent to the deferred manual run (`DEFERRED_MANUAL`). There are **no Critical (leak/security) findings.**

---

## Findings

### Important — fix before merge / before the team test

#### I-1. Degraded L2 + L1-clean prompt silently fails **closed** at the gate; no "protection degraded" advisory exists anywhere (ADR 0014 violation). *(Residual R6 — CONFIRMED)*

This is the single most important behavioral defect. Trace, for a prompt with **no L1 hit** while L2 is dead/timed-out:

1. `scanInto` (`src/detection/scan.ts:13-15`) on `l2 === 'degraded'` returns a synthetic `{ state: 'CLEAN', complete: false }` **but never writes it to the cache** (it returns `cache.getSync(hash) ?? {...}`; with L1 empty the hash was never set).
2. At Send, `decideGate` sees a cold hash → `BLOCK` (`gate.ts:6`), fires `stopImmediatePropagation()` + `preventDefault()` and calls `onBlocked`.
3. `onBlocked` (`content.ts:43-46`) re-runs `scan`, gets `degraded` again, cache still cold → `verdict` is `undefined` → `if (!verdict || verdict.state === 'CLEAN') return;` → **modal never opens, send never proceeds.**

Result: the user presses Send and **nothing happens, with no feedback** — i.e. fail-closed and silent, the exact posture ADR 0014 forbids. A grep confirms **no "protection degraded" / advisory UI is implemented in `src/` or `entrypoints/`**; the `'degraded'` value dead-ends in `scan.ts`. The ACCEPTANCE.md item "Kill the offscreen document mid-session → next send degrades to advisory, does NOT hang" **cannot pass against the current code.**

Note the scope precisely: a prompt **with** an L1 hit still blocks + shows the modal correctly when degraded (the DIRTY verdict was cached in `scan.ts:10`). Only the L1-clean + L2-degraded case misbehaves.

**Fix direction:** propagate `'degraded'` as a first-class verdict state (or a distinct advisory signal) so the gate can **pass the send through** and surface a non-blocking "protection degraded" banner, per ADR 0014. Do not resolve it by letting cold-cache pass generally (that would fail *open* on the normal paste path).

#### I-2. `ACCEPTANCE.md` claims automated gates "are run in CI" — there is no CI. *(Residual #7 — CONFIRMED)*

`code/extension/ACCEPTANCE.md:5`: *"Automated build/test gates are run in CI and recorded in the Task 14 report."* There is **no `.github/workflows/`** in the repo (glob returns zero files). Under CLAUDE.md's cardinal rule (*"a claimed check is not a check"* / gap-over-fabrication), a false process claim in a deliverable must not ship. Trivial to fix: reword to "must be run locally before merge" (or add the workflow). **Must-fix before merge** — it's cheap and it's the exact defect class the package polices.

### Team-test OK (verify live; documented) — do not block merge

#### T-1. Approve → Send `innerText` hash round-trip may re-block the approved send. *(Residual: Task 12 — live-verify)*

The approval token binds to `sha256Hex(rewritten)` (the plain string), but `writeText` sets `el.textContent = rewritten` while the gate reads `adapter.readText()` = `el.innerText`. On the live contenteditable composers (ChatGPT / Claude ProseMirror) `innerText` is very likely to differ (block-wrapping, whitespace normalization), so `hashOf(readText())` misses the `hashes` map → `COLD_HASH` → the approval never matches → the send is re-blocked. It **self-heals to a safe state** (the composer already holds the *masked* text, so a second Send eventually goes through a fresh CLEAN scan — no original leaks), but it degrades the happy path to two Send presses.

Compounding risk: `writeText` dispatches a synchronous `input` event, and `content.ts:68-71` binds `onInput → approvals.invalidate()`. Any framework-emitted `input` reflow **after** `approve()` will kill the freshly minted token. Order today is safe for the synchronous dispatch (approve runs after the sync invalidate), but an async reflow `input` is not guarded.

**Fix direction (when live-verifying):** at Approve time, mint the token against `sha256Hex(adapter.readText())` (hash what the gate will actually read) rather than the plain string, and/or debounce/guard `invalidate()` so the mint isn't clobbered by `writeText`'s own input event.

#### T-2. Cold-cache CLEAN paste swallows the first Send. *(Residual: Task 12 — documented)*
Paste-then-immediate-Send hits a cold cache → `BLOCK` → `onBlocked` scans → CLEAN → returns with no modal, first keypress already swallowed; second Send goes through. Fail-safe, minor UX, already documented in ACCEPTANCE.md. OK for team test.

#### T-3. Drift check is CRLF-sensitive on Windows. *(Residual #8 — CONFIRMED)*
`check-dist-drift.mjs` byte-hashes files; a CRLF checkout of committed `dist/` text files vs an LF fresh build will report false drift. The team **loads** `dist/` (never runs `check:dist`), so it does not block them — but the ACCEPTANCE "Setup" step runs `check:dist`. **Fix direction:** add `.gitattributes` marking `code/extension/dist/**` as `-text` (or `binary`) so line endings are preserved, or normalize before hashing.

#### T-4. Cross-tab `chrome.storage.local` audit races. *(Residual: Task 13 — accepted out of scope)*
Module-local `appendChain` serializes writes within one tab only; concurrent tabs can still lose/duplicate audit rows. SW single-writer is explicitly out of Slice 1 scope. Note only.

#### T-5. Live-verify residuals inherent to the deferred manual run.
- **R1** — ORT threaded WASM with `numThreads=1` initializes without COOP/COEP in the offscreen doc.
- **R2** — hash-pinned first-run weight fetch + cache-key reuse works end-to-end in a real browser (`pin.ts` cache-key derivation is verified against the library source but not live-run).
- **Task 8 selectors** — ChatGPT/Claude composer + send-button selectors resolve on live DOM (the D4-volatile surface; expected to need a touch).

### Minor

- **M-1. Gate treats any non-Shift Enter as send intent regardless of focus/target** (`content.ts:38-40`). With dirty composer text present, an Enter in an unrelated page input could be `stopImmediatePropagation`'d. Consider gating on `isSendControl(path)` **or** the composer being in `composedPath()`.
- **M-2. `attachCharOffsets` desync on normalization** (`messages.ts:69-83`): a token whose decoded `word` isn't a literal substring (accent/NFC normalization) is dropped without advancing the cursor; a following recurring substring could then mis-span. Masking uses `start/end`, so a wrong span could mask the wrong text — most likely in **the wedge's BM/ZH languages**. Watch during acceptance; acceptable for a stock-NER team test.
- **M-3. `messages.ts` CLS/SEP comment** slightly overstates that special tokens reach `attachCharOffsets` (R3). Cosmetic.
- **M-4. Approval token is consumed by TTL/edit, not on send** (`consumeIfMatch` is defined but never called by the gate). This is the **explicitly accepted** follow-up (requirements: "consume-on-send is follow-up (accepted)"), surfaced honestly in the plan's self-review. Not a defect; noting for closure. Consequence: a rewritten prompt can be re-sent within the 60s TTL — acceptable.

---

## Strengths

- **Privacy invariants hold end-to-end.** Audit stores only `{cls, salted-fingerprint, ignored, reason, t}`; `redactReason` strips finding text from the free-text reason; `saltedFingerprint` is a 64-bit salted prefix, non-reversible; the `PERSON_n` map is in-memory only and never persisted/rehydrated (I3/U26/E2 all satisfied). Test asserts no raw text is persisted.
- **Weights are fail-closed.** `verifyPinnedModel` hashes every pinned file (cache-first, then network) and **throws** on mismatch — never "load anyway." No CDN `.mjs` dependency (ORT self-hosted from `public/ort/`), sidestepping the MV3 CSP question.
- **U22 handled correctly** — single-threaded WASM baseline, no COOP/COEP, no `SharedArrayBuffer`; multi-threading left as an opportunistic follow-on.
- **Monotonic-toward-dirty is correct** (`setClean` no-ops over an existing DIRTY; L1 short-circuits to DIRTY before L2).
- **Minimal attack surface / manifest:** `storage` + `offscreen` only, two host permissions, **no `webRequest`**, no `<all_urls>` — matches ADR 0017 §6.2.
- **No auto-submit, no rehydration:** `writeText` never dispatches submit/click; the user always presses Send.
- **Clean TDD discipline & typed seams:** pure `decideGate`, typed content↔offscreen message contract, offset reconstruction verified against the installed library source, and honest `[verify]` tags on live-DOM/live-library facts.
- **Process hygiene:** sole authorship confirmed, trailers stripped (0 remaining), dist rebuilt/committed on bundle-touching tasks.

---

## Residual triage table

| # | Residual | Verdict | Severity |
|---|---|---|---|
| R1 | ORT threaded WASM / `numThreads=1` without COOP/COEP | **Team-test OK** — live-verify (T-5) | Live-verify |
| R2 | Hash-pin first-run weights end-to-end | **Team-test OK** — live-verify (T-5) | Live-verify |
| Task 8 | Adapter selectors on live DOM | **Team-test OK** — live-verify, D4-expected (T-5) | Live-verify |
| Task 12a | Cold CLEAN swallow (second Send) | **Team-test OK** — documented (T-2) | Minor |
| Task 12b | Approve→Send innerText hash round-trip | **Team-test OK, verify early** (T-1) | Important-to-verify |
| Task 13 | Cross-tab `chrome.storage` races | **Team-test OK** — out of scope, note only (T-4) | Minor |
| Task 14 / R6 | Advisory "protection degraded" missing; L2-degraded + L1-clean blocks/swallows silently | **FIX before team test** (I-1) — ADR 0014 violation; acceptance item cannot pass as-is | **Important** |
| #7 | ACCEPTANCE.md "run in CI" inaccurate (no workflow) | **FIX before merge** (I-2) — false-claim class | **Important** |
| #8 | Drift check CRLF sensitivity on Windows | **Team-test OK** — add `.gitattributes` (T-3) | Minor |
| #9 | Live ACCEPTANCE checklist unchecked | **Team-test OK** — `DEFERRED_MANUAL` by design | Expected |

---

## Recommendation

Merge is acceptable **after** I-2 (trivial doc reword) and, ideally, I-1 (the degraded→advisory path — otherwise the team's degrade test fails and the extension appears to hang on a dead engine). Everything else is either an accepted follow-up or a live-verify item that the deferred manual acceptance run is designed to close. No data-leak or authorship defects were found.
