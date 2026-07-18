# Task 3 review — hash-pinned transformers.js NER in an offscreen document

**Verdict: CHANGES REQUESTED.** One Critical (load-bearing offset bug, silent wrong-span, not caught
by the tests because the tests use a token shape the real pipeline never produces), one Important
(unverified WASM/COOP-COEP compatibility on the beyond-brief self-hosting decision). Everything else
— hash-pinning order, degrade-on-error, LOC removal, import boundaries, the `dtype` fix — is correct
and well-sourced.

## 1. Spec compliance

✅ All required files created/modified as specified. Interfaces (`L2Entity`, `ScanRequest`,
`ScanResponse`, `l2Scan`) match the brief exactly. `messages.ts`/`client.ts` import nothing from
`@huggingface/transformers` — only `main.ts` does. LOC/MISC dropped (`KEEP = {PER:'PERSON',
ORG:'ORG'}`). `l2Scan` never throws: `Promise.race` + `.catch(() => 'degraded')` covers timeout,
`sendMessage` rejection, and `ok:false` uniformly. Hash verification (`verifyPinnedModel`) is awaited
and can throw *before* `pipeline(...)` is ever called in `getNer()` — genuinely fail-closed, no
bypass path; confirmed the cache-seed only happens after the hash check passes.

**Extras beyond the brief:** `dtype:'q8'`/`device:'wasm'` (necessary, correct — v2's `quantized:true`
is not a v3 option), `attachCharOffsets` (necessary in spirit, buggy in implementation — see §2),
self-hosted ORT WASM runtime (reasonable direction, unverified execution — see §3).

## 2. CRITICAL — `attachCharOffsets`'s moving cursor mislocates on recurring substrings, and the
test suite cannot see it

The real `TokenClassificationPipeline._call` (`node_modules/@huggingface/transformers/src/
pipelines.js:395`) defaults to `ignore_labels = ['O']`, and `main.ts` calls `ner(msg.text)` with no
options — so **the actual token stream `attachCharOffsets` receives in production contains only
entity-tagged tokens; every non-entity ("O") token is already gone.** The unit tests
(`tests/l2-messages.test.ts`) hand-construct fixtures that include `{entity:'O', word:'Please'}` etc.
— a shape the real pipeline call will never produce. That's why the tests are green and the bug
survives.

Walked the report's own example, "Please email Ahmad about the Apple deal": it passes, but only
because none of its words repeat — the cursor never needs the missing `O` tokens to stay correctly
positioned. Walked the task's recurring-substring probe, e.g. "Apple makes iPhones. I recently bought
stock in Apple." with the model tagging only the **second** "Apple" as `B-ORG` (a realistic recall
gap, not a contrived one): the real token stream reaching `attachCharOffsets` is just `[{entity:
'B-ORG', word:'Apple'}]` — no `O` tokens for the words before it. `cursor` starts at 0, so `text.
indexOf('Apple', 0)` returns the **first** Apple, not the second. `indexOf` **succeeds**, so the
"drop rather than guess" safety net — which only fires on `idx === -1` — never engages. This is a
wrong span silently reported as correct, exactly the failure mode the brief says must never happen
("never guesses… downstream masking uses start/end against the real composer string").

The report's own §2 states the limitation accurately in one clause ("can misalign on a token that
recurs before its true position") and then contradicts it in the next ("never a wrong span written
into the composer") — a recurrence-before-true-position is precisely a case where `indexOf` finds a
match and returns a wrong, non -1 index. The two sentences can't both be true; the second is wrong.

**Fix path (not implemented):** pass `{ ignore_labels: [] }` to `ner()` so the cursor has the full
token stream to advance across, and filter to kept entity types in `mergeNerTokens`/`attachCharOffsets`
instead of relying on the pipeline's own filtering; or use each token's `index` field (present on the
raw output, currently discarded) to anchor position expectations instead of pure substring search.

## 3. IMPORTANT — self-hosted ORT WASM is the right instinct, execution is unverified

The CDN-default finding is real and correctly sourced (`backends/onnx.js:206-212`: unset `wasmPaths`
+ non-service-worker context → jsdelivr, which MV3's default `extension_pages` CSP would block).
Self-hosting under `chrome-extension://…/ort/` is the standard, correct fix, and it doesn't touch the
"raw prompts never reach a server" invariant (static asset, no user data).

The risk is in *which* binary got self-hosted. `onnxruntime-web`'s installed version ships **only**
"threaded" WASM variants (both `ort-wasm-simd-threaded.jsep.wasm` and `…-threaded.wasm` — no plain
non-threaded build exists in this package version). Reading the glue code
(`ort-wasm-simd-threaded.jsep.mjs`), the main-thread path unconditionally constructs `new
WebAssembly.Memory({shared: true, …})` at module init — a call that, per Chrome's own extension docs,
normally requires the extension to opt into cross-origin isolation via `cross_origin_embedder_policy`
/ `cross_origin_opener_policy` manifest keys. **No such manifest keys are in this diff.** Real-world
precedent is mixed: one comparable extension project reported this exact combination degrading
gracefully to single-threaded (~370 ms) rather than throwing without those keys — so it may simply
work — but that is empirical, not something derivable from source alone, and it directly bears on the
brief's own stated assumption ("baseline single-thread WASM… needs no COOP/COEP"). `numThreads = 1`
governs how many *additional* worker threads ORT spawns; it does not change which WASM binary is
loaded or whether that binary's own shared-memory initialization succeeds.

This is exactly what Step 8 (deferred, `DEFERRED_MANUAL`) would have caught, and it's the one
deferred check that actually matters for whether L2 detection works at all — not just whether it's
fast. If it fails, the failure is silent and total: `getNer()`'s catch → `{ok:false}` → `client.ts`
→ `'degraded'` forever, never a crash, but L2 permanently inert. Given ADR 0014, this degrades safely
rather than fails closed — but it should be the very first thing verified on Step 8, ahead of the
smoke-test's own checklist.

## 4. Minor

- `verifyPinnedModel` uses `fetch(..., {cache:'no-store'})` and never checks the Cache API before
 re-fetching — correct for "always verify what's trusted," but it means every offscreen-document
 respawn re-downloads all four pinned files (including the full ONNX weights) from the network, not
 just "first run." Doesn't violate the no-user-data invariant, but the report's "later calls are fast"
 claim only holds within a single offscreen-document lifetime, which ADR 0006 says Chrome may reclaim.
- `client.ts`'s `setTimeout` for the timeout race is never cleared after `call` wins — harmless (a
 resolved promise's second `resolve` is a no-op) but a dangling timer.
- `background.ts`'s message handler has no `try/catch` around `ensureOffscreen()`/`sendMessage` — an
 uncaught rejection there never calls `sendResponse`, which still resolves to `'degraded'` on the
 content side via the closed message port, but the failure isn't logged anywhere.

## 5. Not a concern

Manifest interfaces, `PER`/`ORG` merge logic (including the wordpiece-`##` continuation fix, which is
a real and correctly-diagnosed fix to the brief's own broken reference implementation), pin-file
selection (`vocab.txt` correctly excluded — traced to the tokenizer loader never fetching it), WXT
offscreen path (`offscreen.html`, confirmed by building), and the Co-Authored-By trailer (flagged per
instructions, not the implementer's doing).
