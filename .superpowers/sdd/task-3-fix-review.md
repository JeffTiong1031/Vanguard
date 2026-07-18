# Task 3 fix re-review — Critical + Minors

**Base:** `ab384ce` · **Head:** `bbcc575` (confirmed = current `HEAD`)

## Critical — `attachCharOffsets` recurring-substring mislocation: ✅ RESOLVED

1. **`ignore_labels: []` reaches the pipeline.** `entrypoints/offscreen/main.ts:66` calls `ner(msg.text, { ignore_labels: [] })`. Confirmed against `node_modules/@huggingface/transformers@3.8.1/src/pipelines.js:394-396`: `_call` defaults `ignore_labels = ['O']` and filters on it at line 425 — root cause is exactly as claimed, and the override is real, not cosmetic.
2. **Full ordered stream reaches `attachCharOffsets`.** `attachCharOffsets` itself is unchanged (logic-identical to pre-fix) — the fix is entirely in *what main.ts feeds it*. That's correct: the function's cursor algorithm was always right, it was starved of the O tokens it needs to stay contiguous.
3. **Special tokens:** `pipelines.js:430-435` decodes with `skip_special_tokens: true` and drops any token whose decoded `word === ''` *before* it ever leaves `_call` — so `[CLS]`/`[SEP]` never reach `attachCharOffsets` at all under the real pipeline. `messages.ts`'s comment implies they arrive and get dropped via `idx === -1`; that's defensively harmless (the `if (!piece) continue` / `idx===-1` guard is a correct no-op) but the comment overstates what actually happens — a documentation nit, not a defect.
4. **Contiguity on indexOf-miss:** confirmed by reading — a failed `indexOf` does not advance `cursor`, so one unalignable token can't corrupt subsequent real lookups.
5. **`mergeNerTokens` on O-inclusive input:** `'O'.split('-')` → `rawLabel=undefined` → `KEEP[undefined]` is `undefined` → `cur=null; continue`. O tokens are correctly discarded post-offset-attachment; no new leak or merge-boundary bug from including them.
6. **Test genuinely reproduces the bug and is production-shaped.** Ran it standalone: `npx vitest run tests/l2-messages.test.ts` → **6/6 passed** (verified myself, not just trusted the report). The new test hand-builds both shapes — entity-only (what `ignore_labels:['O']` would hand production pre-fix) and the full ordered stream with O tokens (what `ignore_labels:[]` hands it post-fix) — over a sentence with three recurring "Apple/apple" mentions, tags only the third, and asserts the entity-only shape lands on the WRONG (first, index 7) span while the full-stream shape lands on the CORRECT (later, index 46) span through `mergeNerTokens` end-to-end. This is a legitimate regression test at the right level: it doesn't mock the real pipeline call, but it doesn't need to — the bug and fix are fully characterized by which token shape reaches `attachCharOffsets`, and that's exactly what's varied.

## Minor 1 — dangling `setTimeout`: ✅ RESOLVED
`client.ts` now captures the timer handle and `clearTimeout`s it in a `finally` around `Promise.race`, covering both race outcomes (call-wins clears the pending timer; timeout-wins clears an already-fired one, harmless no-op).

## Minor 2 — `background.ts` throw handling: ✅ RESOLVED
Async IIFE wrapped in try/catch; on throw, `sendResponse({kind:'l2-result', id, ok:false, error:String(e)})`. Matches `offscreen/main.ts`'s existing pattern. Prevents an unhandled rejection that previously left the content side silently waiting for the timeout.

## Minor 3 — `pin.ts` cache-hit short-circuit: ✅ RESOLVED, fail-closed on both paths
`cache.match(url)` checked before `fetch`; on hit, cached bytes are hashed and mismatch throws (`hash mismatch for ${file} (cached)`) — no bypass. On miss, unchanged fetch→hash→throw-on-mismatch→`cache.put` path. Verified both paths throw before any use of the bytes. `cache.match` returning a body-once `Response` doesn't affect the underlying Cache Storage entry — later `caches.match()` calls (by transformers.js itself) get an independent Response, so consuming `.arrayBuffer()` here doesn't corrupt the seeded cache.

## Residual / non-blocking
- Comment in `messages.ts` slightly overstates that `[CLS]`/`[SEP]` reach `attachCharOffsets` and get dropped there — they're actually filtered upstream by the pipeline's own `skip_special_tokens` decode. No functional impact.
- Threaded-only ORT WASM / COOP-COEP live-browser check remains deferred (Step 8, `DEFERRED_MANUAL`) — expected and acceptable per the task's own scope; not re-litigated here.
- No new correctness issue found from including O tokens.

## Verdict
- **Spec compliance:** ✅
- **Task quality:** **Approved**
