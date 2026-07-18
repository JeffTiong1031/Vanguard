# Task 12 Review — wire content.ts full flow + rebuild dist

## Spec ✅

All brief steps and global constraints verified against the actual diff (not just the report):

- `debounce.ts` matches the brief's implementation exactly (generic, clearTimeout/setTimeout).
- `content.ts` composes adapter → scan → cache → gate → mask → modal → approval → audit, matching the brief's Step 2 pseudocode near-verbatim (imports, `COLD_HASH`, `L2_TIMEOUT_MS = 4000` tagged `(estimate)`, `summarise()`).
- **No auto-submit (#8):** `onApprove` only calls `adapter.writeText` + `approvals.approve` + `hideModal`; nothing dispatches Enter or calls a send control. Verified no other `writeText`/dispatch call exists outside this path.
- **No rehydration / no silent redact:** `writeText` is called from exactly one call site (`onApprove`), only after the user's explicit click; originals never re-enter the page.
- **Approval uses `currentHash()`**, not `consumeIfMatch` — `gate.ts`'s `decideGate` calls `deps.approvedHash()` → `approvals.currentHash()`. Correct per the stated follow-up note.
- **I3 (class+count / salted-fp only):** modal receives `rewritten` (already masked) text and a `{cls,count}` summary, never raw finding text or raw findings array. `recordFindings`/`recordIgnore` go through `saltedFingerprint(text, salt)` — confirmed in `audit.ts` (unchanged this diff).
- **Gate mechanics (ADR 0005/0010/U12-b, pre-existing but exercised here):** listens on `window`, capture phase, uses `composedPath()`, skips `isComposing` events — all intact and now actually wired to a live adapter/cache instead of the removed `__vgScan` stub.
- **Composer-may-be-null:** `bindComposer()` is called once eagerly and re-invoked via a `MutationObserver({childList:true, subtree:true})` on `document`; identity-checked (`composer === boundComposer`) so listeners are only swapped when the underlying element actually changes.
- **Dist rebuilt + committed:** `git diff --stat` between base/head confirms `dist/chrome-mv3/content-scripts/content.js` changed (1 file, +1/-1) — the only chunk that should move given only `content.ts` changed source-side. `check:dist` passing is corroborated by the `check-dist-drift.mjs` fix being necessary and present.
- **No dedicated unit test:** confirmed — `git diff --stat -- code/extension/tests` between base/head is empty; 17 test files / 89 tests both pre- and post-diff, matching the report and the brief's explicit "no unit test of its own" note.
- **Drift-script fix is real, not cosmetic:** `check-dist-drift.mjs` now pins `NODE_ENV=production` on the child `wxt build` invocation, which is the correct layer to fix (the grandchild build process, not the vitest-invoking process) — the JSX-dev-metadata leak the report describes is exactly what an inherited `NODE_ENV=test` would cause in a Vite build.
- Commits are sole-authored by `JeffTiong1031`, no co-author trailer — verified via `git log`.

## Quality

Clean, thin composition layer — matches the brief's "keep it thin, wire already-tested modules" instruction. No dead code, no leftover `__vgScan` hook. TypeScript strict mode compiles (implied by build success); underscore-prefixed unused param (`_path`) follows convention. The `check-dist-drift.mjs` fix is minimal and targeted at the right process boundary.

Two real (non-blocking) design gaps worth Phase 5 attention, both inherited from the brief's own pseudocode rather than introduced by this task:

1. **Silent swallow on a cold-cache Send that resolves CLEAN.** `installGate`'s handler synchronously calls `stopImmediatePropagation()`/`preventDefault()` on *any* cold-hash Send attempt, then `onBlocked` asynchronously re-scans; if the async verdict is CLEAN it just `return`s — no modal, no re-dispatch, no toast. The user's keypress is dropped with zero feedback and they must press Send again. This is the brief's own documented behavior ("scan came back clean; nothing to show"), not a deviation, but it means the "one extra keypress, only on dirty prompts" claim in doc 05 §6.4 doesn't fully hold — a fast paste-then-Enter on *clean* text pays the same cost, because the cache is cold by construction on paste (doc 06 §2.3's own point). Worth flagging for doc 08, not for this task.
2. **Approval-hash coupling is exact-string, with no normalization between what `rewrite()` produces and what `adapter.readText()` (`el.innerText`) reports back after `writeText()` (`el.textContent = …`).** If the DOM round-trips whitespace/newlines differently than the plain-string `rewrite()` output (plausible for a contenteditable div), the post-approve Send will hash-mismatch the approval token, silently fall into gap #1 (cold-cache → re-scan → CLEAN → drop), and force a second Send press even though nothing is wrong. This is genuinely task 12's own composition logic (the hash-keyed `hashes` map plus the approval-token match), not the adapters' fault, and it's exactly the kind of thing only a live-DOM test catches — recommend Phase 5 explicitly exercises "Approve, then press Send" end-to-end on real ChatGPT/Claude, not just "modal renders and Approve writes text."

Minor, lower-severity notes, not action items for this task:
- `hashes: Map<string,string>` is unbounded for the life of the tab (grows one entry per distinct debounced/pasted text state); fine for a team-test session, worth a TTL/size bound before a longer-lived Phase 1 build.
- Paste triggers both the dedicated `onPaste` immediate scan (of the clipboard fragment) and, shortly after, a native `input` event that schedules a redundant debounced scan of the full composer text — harmless (idempotent, cache-keyed), just a wasted scan cycle.
- Every DIRTY debounced typing scan calls `recordFindings` (per the brief's own pseudocode), so the audit log's "flagged" count includes transient/never-sent dirty states, not just actual gate blocks — intentional per spec, but worth knowing when reading `ignoreRateByClass` numbers later.

## Findings

No spec violations, no privacy-invariant violations, no unauthorized deviations from the brief. The two design gaps above are pre-existing in the plan's own pseudocode (verified by diffing against the brief) and are UX/latency-class issues that fail safe (never fail-open, never auto-submit, never silently mask) — appropriate to carry into Phase 5 acceptance rather than block this task.

## Summary

Task 12 wires the full block→modal→rewrite→user-sends composition exactly as the brief specified, upholds every global constraint (no auto-submit, no rehydration, I3, monotonic/advisory degrade untouched), rebuilds and commits a matching `dist/`, and fixes a real drift-checker environment bug — two inherited (not introduced) UX edge cases around cold-cache/exact-hash matching are worth explicit Phase 5 coverage but do not block acceptance.
