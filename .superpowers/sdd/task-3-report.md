# Task 3 report — hash-pinned transformers.js NER in an offscreen document

**Status: DONE** (Step 8 browser smoke test DEFERRED_MANUAL per resolution #6; everything else complete and verified).

- **BASE:** `6e6e0c6dfac5b6b617afbfe8db5494d64421ec11`
- **Commit:** `751d958c71978df94545076b7b2f4f1aed03bf26` (`feat(ext): hash-pinned transformers.js NER in an offscreen document`)
- **Author:** `JeffTiong1031 <jefftiong1031@gmail.com>` (git config untouched)
- ⚠️ **Cursor auto-injected a `Co-authored-by: Cursor <cursoragent@cursor.com>` trailer into the commit body despite instructions not to.** I did not add it and did not amend to remove it (per instructions: "controller strips it"). Flagging here as directed.

---

## 1. transformers.js v3 API — what I verified and chose

Read the installed package's source directly (`node_modules/@huggingface/transformers@3.8.1`), not docs, since the brief's `quantized: true` is a v2-only option.

- **`dtype: 'q8'`, `device: 'wasm'`** passed to `pipeline('token-classification', MODEL_ID, {...})`.
  - `utils/dtypes.js`: `DATA_TYPES.q8 = 'q8'`; `DEFAULT_DTYPE_SUFFIX_MAPPING[q8] = '_quantized'`; `DEFAULT_DEVICE_DTYPE_MAPPING[wasm] = q8` (q8 is already the wasm default — I set it explicitly anyway, for clarity and to keep the manifest pin honest against an explicit choice, not an implicit default that could change).
  - `models.js:246-248`: file name = `${subfolder}/${fileName}${suffix}.onnx`; `subfolder` defaults to `'onnx'`, `fileName` defaults to `'model'` → **`onnx/model_quantized.onnx`**. This is the exact file pinned.
- **Pinned ONNX filename: `onnx/model_quantized.onnx`.**

## 2. A real API gap the brief didn't anticipate: no character offsets

The installed pipeline's `_call` (`src/pipelines.js`) **never sets `start`/`end`** on its output tokens — literally `// TODO: Add support for start and end` in the source, even though its own JSDoc/`.d.ts` declares them as optional fields. The tokenizer has no `return_offsets_mapping` support either (checked `tokenizers.js` — no such option exists). So the real runtime shape is `{ entity, score, index, word }`, **not** `RawNerToken`'s required `start`/`end`.

This matters because the brief itself says downstream masking uses `start`/`end` against the real composer string, never `text`. Casting the raw output straight to `RawNerToken[]` (as the brief's Step 3 snippet does) would silently ship `start: undefined, end: undefined` on every entity — a load-bearing defect, not a cosmetic one.

**Fix (added, not in the brief):** `attachCharOffsets(text, tokens)` in `messages.ts` — walks the text left-to-right, strips a token's `##` continuation prefix before searching, and reconstructs `start`/`end` via `indexOf` from a moving cursor. This is the same fallback HF's own Python pipeline uses when a fast tokenizer's offset mapping isn't available. Known limitation, documented in-code: can misalign on a token that recurs before its true position or on rare Unicode-normalization mismatches; a token that can't be aligned is **dropped, never guessed** (silent recall loss on one mention, never a wrong span written into the composer). `main.ts` calls `attachCharOffsets(msg.text, raw)` before `mergeNerTokens`.

## 3. A second finding: the ORT WASM runtime's own CDN default (self-hosted instead)

Also from source (`src/backends/onnx.js`): unless `wasmPaths` is already set, transformers.js points ONNX Runtime Web's WASM/`.mjs` loader at `https://cdn.jsdelivr.net/npm/@huggingface/transformers@.../dist/` for any non-service-worker context — which includes our offscreen document. MV3's default `extension_pages` CSP is `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`, which would block that CDN's `.mjs` module load (this is separate from, and additional to, the numThreads/COOP-COEP part of U22 that the brief names explicitly).

**Decision:** self-hosted the runtime instead of relying on the CDN. Copied `ort-wasm-simd-threaded.jsep.{mjs,wasm}` (the only WASM runtime pair the installed package ships — 21.6 MB, threaded+SIMD+JSEP build; there is no smaller variant bundled) into `public/ort/`, so WXT copies them verbatim into `dist/chrome-mv3/ort/`, and set `env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/')` in `main.ts`. This makes the runtime same-origin (`chrome-extension://<id>/ort/...`), sidestepping the CSP question entirely rather than hoping it's permitted. **Cost, stated plainly:** +21.6 MB to the committed `dist/` (total `dist/chrome-mv3` is now 22.55 MB, up from ~25 KB). **`[verify]` in a live browser** — this is a decision made from reading the CSP and the library's fallback path, not a live-tested one (Step 8 is deferred). The alternative (leave the CDN default) was rejected because a CSP violation would silently break every scan with no working fallback to test against, and I cannot drive a real Chrome instance this session.

## 4. Hash-pinning — verified, not just "should work"

Traced `env.useBrowserCache=true` through `utils/hub.js`: it opens `caches.open('transformers-cache')`, and — for the browser Cache API path — the cache key it looks up (`proposedCacheKey`) is exactly `pathJoin(env.remoteHost, env.remotePathTemplate.replace(...), filename)`, i.e. `https://huggingface.co/<model>/resolve/main/<file>`. `pin.ts`'s `fileUrl()` builds byte-for-byte the same string. So the cache-seeding mechanism the brief flagged as `[verify]` **is confirmed correct against the live library source**, not left as a guess. `verifyPinnedModel()` fetches each pinned file, SHA-256s it, throws on mismatch, and only then seeds the cache — fail-closed, no bypass path.

**Files fetched by the running code (confirmed from source, not assumed):** `config.json` (model config), `tokenizer.json` + `tokenizer_config.json` (tokenizer — always fetched together, unconditionally), `onnx/model_quantized.onnx` (weights). **`vocab.txt` is deliberately not pinned** — transformers.js's tokenizer loader never fetches it (only the two files above), so pinning it would be dead weight, not security. All four pinned files were re-hashed live via `node scripts/build-model-manifest.mjs` (real network fetch, not invented):

```
config.json               7aa891abae067f95a40f5e2005b3de44824a083f256802934a993d301ec25076
tokenizer.json             bf1b59b7b11c95f194f51708d918eea378e09d05f84c0e1656dc5180e8117088
tokenizer_config.json      e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a
onnx/model_quantized.onnx  5b65139844be260b624a2a13782b01d122e613d64ce16ed0ba4d82e0b816f1a9
```
(each independently confirmed 64 hex chars = 32 bytes = valid SHA-256, via `node -e`.)

## 5. WXT offscreen output path — confirmed by building, not guessed

WXT 0.19 has **no special-cased "offscreen" entrypoint type** (checked `node_modules/wxt/dist` — no match for "offscreen" or "unlisted" anywhere in the bundle). `entrypoints/offscreen/index.html` is picked up as a generic HTML page. Built and inspected `dist/chrome-mv3/`:

```
dist/chrome-mv3/offscreen.html                       180 B
dist/chrome-mv3/chunks/offscreen-<hash>.js           879 KB
dist/chrome-mv3/ort/ort-wasm-simd-threaded.jsep.mjs   44 KB
dist/chrome-mv3/ort/ort-wasm-simd-threaded.jsep.wasm  21.6 MB
```

**`OFFSCREEN_URL = 'offscreen.html'`** — my initial guess (matching the brief's placeholder) turned out to be exactly right; confirmed against a real build rather than left as an assumption.

## 6. TDD RED → GREEN on `mergeNerTokens` — found a real bug in the brief's reference code

RED: wrote `tests/l2-messages.test.ts` verbatim per Step 1, ran it — **2 of 5 failed**, but not for a boilerplate "file doesn't exist" reason. One failure was my own test-fixture arithmetic error (fixed). The other was real: the brief's own reference implementation —

```ts
cur.text += t.word.startsWith('##') ? t.word.slice(2) : t.word;
```

— concatenates a same-type continuation word **without a space**, so `"Ahmad"` + `"Ali"` → `"AhmadAli"`, not `"Ahmad Ali"` as the brief's own test (also given verbatim) expects. The brief's implementation would fail its own test. Fixed to `` : ` ${t.word}` `` (space before a whole new word; no space when gluing a `##`-continuation). Added two more cases (wordpiece continuation, and `attachCharOffsets`'s alignment + drop-on-miss behavior) for confidence in the new code. GREEN:

```
✓ tests/l2-messages.test.ts (5 tests) 4ms
```

## 7. Build, drift, full suite — all green, in order

1. `npm run build` → offscreen entrypoint emitted, `public/ort/*` copied into `dist/chrome-mv3/ort/*`, drift-check `--write` ran automatically (postbuild).
2. `node scripts/check-dist-drift.mjs` → `dist/ matches a fresh build.`
3. `npx tsc --noEmit -p .` → clean except one **pre-existing, unrelated** error in `tests/dist-drift.test.ts` (`TS7016`, missing `.d.ts` for a `.mjs` import) that predates this task and that I did not touch — left as-is, out of scope.
4. `npx vitest run` (full suite, pre-commit): **8/9 passed** — the one failure was `dist-drift.test.ts`'s `afterAll` git-cleanliness assertion, which by construction cannot pass before the new `dist/` content is committed (it diffs `git status --porcelain` against HEAD). Expected, not a bug.
5. Committed.
6. `npx vitest run` again, post-commit: **8/8 passed.**

```
✓ tests/l2-messages.test.ts (5 tests)
✓ tests/dist-drift.test.ts (3 tests)
Test Files  2 passed (2)
     Tests  8 passed (8)
```

## 8. Manual smoke-test steps (DEFERRED_MANUAL — I cannot drive Chrome)

1. `cd code/extension && npm run build` (or just load the committed `dist/chrome-mv3` as-is).
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select `code/extension/dist/chrome-mv3`.
3. Open `https://chatgpt.com` (or `https://claude.ai`), open DevTools console on that tab.
4. Run: `await window.__vgScan('Please email Ahmad about the Apple deal')`
5. **Expected:** `{ kind: 'l2-result', id: '1', ok: true, entities: [ { type: 'PERSON', start: 13, end: 18, text: 'Ahmad' }, { type: 'ORG', start: 29, end: 34, text: 'Apple' } ] }` (offsets are against the literal input string above). First call is slow (verifies + downloads ~model weight files + initializes WASM); later calls should be fast.
6. **What to watch for specifically, given the two findings above:** (a) a CSP violation in the console mentioning `script-src` when the offscreen document initializes ORT — would indicate the self-hosted `wasmPaths` fix needs adjustment; (b) `ok: false` with a hash-mismatch error — would indicate the model was updated upstream since pinning (re-run `node scripts/build-model-manifest.mjs` deliberately, not silently); (c) entity `start`/`end` that don't line up with the actual substring — would indicate `attachCharOffsets` misaligned (check for repeated words or non-Latin scripts in the input).
7. Check `chrome://extensions` → service worker / offscreen document logs for `[vanguard]` console lines and any uncaught errors during first load.

## 9. Concerns / residual risk (none blocking DONE, all documented above)

- **Not live-tested in a real browser** (Step 8 deferred). The two library-behavior findings above (missing offsets, CDN wasmPaths default) are source-verified, not browser-verified.
- **+21.6 MB to committed `dist/`** for the self-hosted ORT runtime — a one-time, deliberate cost to avoid an untestable CSP risk. Worth a doc 06/08-style note if repo size becomes a concern later.
- **`vocab.txt`** is listed as pre-verified/accessible by the controller but is correctly excluded from the pin manifest since the running code never fetches it — noting so this isn't mistaken for an oversight later.
- Pre-existing, unrelated `tsc` finding in `tests/dist-drift.test.ts` (see §7.3) — not fixed, not introduced by this task.

**Report path:** `.superpowers/sdd/task-3-report.md`


---

# Fix pass � Critical offset bug + Minors (2026-07-18)

**Status: DONE**

- **Fix commit:** `37598fd4600feaef241fd85e2d8a4cdbe13472ee` � `fix(ext): correct L2 char-offset reconstruction on recurring substrings; harden client/bg/pin`
- **Author:** `JeffTiong1031 <jefftiong1031@gmail.com>`
- ?? Cursor again auto-injected `Co-authored-by: Cursor <cursoragent@cursor.com>` � not added by me; controller strips.

## CRITICAL � attachCharOffsets recurring-substring mislocation

**Root cause (confirmed):** `TokenClassificationPipeline._call` defaults to `ignore_labels = ['O']` (`src/pipelines.js:395`). Entity-only tokens reach `attachCharOffsets`, so `indexOf(piece, cursor)` lands on the FIRST occurrence of a recurring word even when the tagged mention is later.

**Library option used:** `ner(msg.text, { ignore_labels: [] })` � verified against transformers@3.8.1:
- option name `ignore_labels` (string array) on the pipeline *call*, not on `pipeline()` construction
- documented example at `pipelines.js:~370` shows exactly `{ ignore_labels: [] }` yielding the full ordered stream including `O` tokens in sequence order
- no tokenizer `return_offsets_mapping` exists in this install; full-stream `indexOf` reconstruction kept

**Production change:** `entrypoints/offscreen/main.ts` now calls with `ignore_labels: []`. `mergeNerTokens` still drops non-KEEP labels (O sets `cur = null`). Special tokens with non-substring `word` still drop without advancing cursor.

### RED ? GREEN evidence (recurring-substring test)

Sentence: `I love Apple and my friend has an apple; call Apple Inc` (first `Apple` @7, last @46).

**RED (entity-only = old production shape):**
`
attachCharOffsets(text, [{ entity: 'B-ORG', word: 'Apple' }])
? start: 7  (FIRST Apple � WRONG)
`
Asserted in the new test: `entityOnly[0].start === firstApple` and `!== lastApple`.

**GREEN (full ordered stream = production after fix):**
`
O tokens for "I love Apple and � call" advance the cursor past the early Apples;
B-ORG "Apple" + I-ORG "Inc" ? start: 46, end: 55 (CORRECT later occurrence)
mergeNerTokens ? { type:'ORG', start:46, end:55, text:'Apple Inc' }
`

Post-fix: `npx vitest run` ? **9/9 passed** (`l2-messages` 6/6 including the new regression; `dist-drift` 3/3).

## Minors

1. **client.ts** � `clearTimeout` in `finally` after `Promise.race` so a winning scan does not leave a dangling degraded timer.
2. **background.ts** � try/catch around the async IIFE; on throw `sendResponse({ kind:'l2-result', id, ok:false, error: String(e) })` so content sees a real error instead of only a timeout.
3. **pin.ts** � before network fetch, `cache.match(url)`; if hit, hash the *cached* bytes and throw on mismatch (still fail-closed); skip network. Fetch only on cache miss, then seed. Avoids re-downloading weights on every offscreen respawn.

## ORT-variant finding (non-blocking)

Checked `@huggingface/transformers@3.8.1/dist` and `onnxruntime-web/dist`:

| File | Present? |
|---|---|
| `ort-wasm-simd-threaded.jsep.wasm` | yes (21.6 MB) � what we self-host |
| `ort-wasm-simd-threaded.wasm` | yes in onnxruntime-web only (11 MB) |
| `ort-wasm-simd.jsep.wasm` (non-threaded) | **NO** |
| any non-threaded `*.wasm` | **NO** |

**Only threaded builds ship.** Kept the threaded+jsep pair. Whether it runs with `numThreads = 1` without COOP/COEP is a **LIVE-BROWSER verification for deferred Step 8 / acceptance** � if it does not, the scan path fails and content degrades to advisory (ADR 0014), not a silent wrong answer.

---

# Task 3 (Plan B): the policy client — background only (2026-07-20)

⚠️ **Note on this file's history:** everything above this section is a report for a *different*
"Task 3" — hash-pinned transformers.js NER in an offscreen document, from an earlier/parallel plan.
Task numbers have apparently been reused across plans. This section is the report for **Plan B
Task 3**, as briefed in `C:\Projects\Vanguard\.superpowers\sdd\task-3-brief.md`: the HTTP client
connecting the extension to the policy service (enrol / conditional-GET refresh / access request).
Appended rather than overwriting, to preserve the prior report.

**Status: DONE**

- **Commit:** `49cd6ad` — `feat(ext): policy client with conditional GET and offline fallback`
- **Author:** `HongHanTan <jasonthh123@gmail.com>` (git config untouched), no `Co-Authored-By`
  trailer.
- **Files:** `code/extension/src/policy/client.ts` (new, 84 lines), `code/extension/tests/policy-client.test.ts`
  (new, 108 lines). Both taken verbatim from the brief — no code changes from what the brief gave.

## What was implemented

- `enrol(token) -> Promise<Enrolment>` — POSTs `{ token }` to `${base}/v1/enroll`. Throws a
  readable error (`/not recognised/i`) on HTTP 401, a generic `Enrolment failed (<status>).` on any
  other non-OK status. On success, persists `{ org_id, org_name, pseudo_id, department }` and the
  returned policy via `saveEnrolment`, and returns the enrolment.
- `refreshPolicy() -> Promise<Policy | null>` — returns `null` with **no network call** if
  `getEnrolment()` is null. Otherwise does a conditional GET against
  `${base}/v1/policy?org_id=<org_id>`, attaching `If-None-Match` **only when a cached etag
  exists**. Three independent fallback paths all return the cached policy instead of `null` or a
  throw: HTTP 304, any non-OK response, and a thrown `fetch` (caught by `try/catch`, e.g. network
  down). On a genuine 200, persists the new policy + the response's `etag` header via `savePolicy`.
- `sendAccessRequest(llmId, reason) -> Promise<void>` — POSTs
  `{ pseudo_id: enrolment.pseudo_id, llm_id: llmId, reason }` to `${base}/v1/requests`. Throws if
  not enrolled, or on a non-OK response.
- `timedFetch` — internal helper wrapping `fetch` with `AbortController`, timing out after
  `POLICY_CONFIG.requestTimeoutMs` (already tagged `(estimate)` in Task 2's `config.ts` — reused,
  not a new untagged guess).
- Header comment on `client.ts` preserves the "BACKGROUND SERVICE WORKER ONLY" mixed-content
  warning verbatim, including the spec §5.4 cross-reference, per the binding constraint that a
  content script on `https://chatgpt.com` cannot fetch `http://` on a LAN address.

## TDD sequence and exact output

**Step 1/2 — test written first, run to confirm the expected failure:**

```
$ npx vitest run tests/policy-client.test.ts
```
```
FAIL tests/policy-client.test.ts [ tests/policy-client.test.ts ]
Error: Failed to resolve import "../src/policy/client" from "tests/policy-client.test.ts".
Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```
Matches the brief's stated expected failure exactly (`Failed to resolve import "../src/policy/client"`).

**Step 3/4 — after writing `client.ts`:**

```
$ npx vitest run tests/policy-client.test.ts
```
```
✓ tests/policy-client.test.ts (6 tests) 28ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

**Full suite:**

```
$ npx vitest run
```
```
Test Files  31 passed (31)
     Tests  168 passed (168)
Duration    28.62s
```
162 baseline (confirmed as the starting point in the task instructions) + 6 new = 168. Nothing
broken. `tests/dist-drift.test.ts` (`committed dist matches a fresh build`) passed as part of this
run, which ran an actual `npm run build` internally and diffed it against the committed `dist/` —
confirming the new, currently-unreferenced `src/policy/client.ts` module does not change build
output. No need to stage `dist/` separately for this task.

## Self-review (the three checks the task specifically asked for)

1. **Does `refreshPolicy()` send `If-None-Match` only once an etag exists?** Yes:
   `{ headers: etag ? { 'If-None-Match': etag } : {} }`. First call (`getEtag()` returns `null`,
   nothing cached yet) omits the header entirely; the test's second call sends it because the
   first call's `savePolicy` persisted the etag from the mocked response's `etag` header
   (`W/"o1-1"`). Verified both by reading the code and by the passing test that asserts on
   `fetchMock.mock.calls[1]![1].headers['If-None-Match']`.
2. **Does each of the three failure paths return the cached policy, never `null`/a throw?**
   - HTTP 304 → `return await getCachedPolicy();`
   - Non-OK (4xx/5xx) → `return await getCachedPolicy();`
   - Thrown `fetch` (network down) → caught by the surrounding `try { ... } catch { return await
     getCachedPolicy(); }`.
   All three converge on the same cache read, all covered by dedicated tests (304-then-cache,
   network-throw-then-cache; the non-OK path isn't separately unit-tested by the brief's suite but
   shares the identical `getCachedPolicy()` call as the 304 path, so it's covered by inspection).
3. **Does `sendAccessRequest` send `pseudo_id` and never a name or email?** Confirmed. Request
   body is exactly `{ pseudo_id: enrolment.pseudo_id, llm_id: llmId, reason }`. `Enrolment` (from
   `types.ts`, Task 1) has no `name` or `email` field at all — "no name, no email — the server never
   issues one, so there is nothing here to leak," per that file's own doc comment — so there is
   nothing for this function to leak even by a future accidental field addition to the request
   body literal.

## What was changed from the brief, and why

Nothing. Both `client.ts` and `policy-client.test.ts` were used verbatim, including the
already-applied 304/`null`-body test correction (`new Response(null, { status: 304 })`), which was
left untouched exactly as instructed.

## Commit hygiene

Staged only the two files belonging to this task via explicit paths (not `git add -A`). The
working tree had substantial unrelated churn under `.superpowers/sdd/` at commit time — from other
task sessions running concurrently against the same repo (modifications to `task-1-*`/`task-2-*`
briefs and reports, deletions of `task-4-brief.md` through `task-14-brief.md`). None of that was
touched, staged, or committed by this task. `git show --stat HEAD` confirms the commit contains
only the two intended files, 192 insertions, no deletions.

## Concerns

- **File-path collision, not a code concern:** this report file (`task-3-report.md`) already held
  a report for a different "Task 3" from what appears to be an earlier or parallel plan (Plan A?),
  about offscreen-document NER — unrelated to the policy client. Appended rather than overwrote, to
  avoid destroying that prior record; flagging in case the orchestrating session expected a clean
  file and needs to reconcile the two plans' task numbering.
- **Unrelated in-flight changes in the working tree** (see Commit hygiene above) — not introduced
  by this task, left as found, noted so the orchestrating session is aware they're sitting there
  uncommitted.
- No concerns with the implementation itself — all six new tests and the full 168-test suite pass,
  and all three specifically-requested review points check out by direct code inspection.

---

# Test-coverage closure: non-OK response and unenrolled guardrails (2026-07-20)

**Status: DONE**

- **Commit:** `de8fec3` — `test: cover non-OK response and unenrolled guardrails in policy-client`
- **Author:** `HongHanTan <jasonthh123@gmail.com>`, no `Co-Authored-By` trailer
- **File:** `code/extension/tests/policy-client.test.ts` (2 new tests added)

## Finding 1: Non-OK response path (HTTP 5xx) untested

**The gap:** `refreshPolicy()` has three independent failure fallback paths, all returning cached policy per ADR 0014:
- (a) HTTP 304 → cached policy ✅ TESTED
- (b) non-OK response (e.g. 500) → cached policy ❌ **NOT TESTED** (this gap)
- (c) thrown fetch → cached policy ✅ TESTED

The `if (!response.ok) return await getCachedPolicy();` line (client.ts:64) could be deleted or inverted and the test suite would still pass 6/6.

**Test added:** Seeds both `vg_enrolment` and `vg_policy`; stubs fetch to return `{ status: 500 }`; asserts `refreshPolicy()` returns cached policy with `version === 1`.

**Negative control (FAIL proof):**
```
$ git checkout HEAD -- src/policy/client.ts
$ edit: delete line 64 (if (!response.ok) ...)
$ npx vitest run tests/policy-client.test.ts
FAIL  | returns the cached policy when the response is not OK
AssertionError: expected undefined to be 1
```
Failure: test asserts `?.version` but got `undefined` (function parsed 500 as JSON, failed, returned nothing). ✅ Test catches the bug.

**Restore:** re-added line 64, confirmed all 8/8 pass.

## Finding 2: Unenrolled sendAccessRequest throws without network call

**The gap:** `sendAccessRequest()` guards against unenrolled callers with `if (!enrolment) throw new Error('Not enrolled.')` (client.ts:76) — a binding safety check — and that branch has no test.

**Test added:** Does NOT seed `vg_enrolment`; stubs fetch; asserts `sendAccessRequest()` rejects with `'Not enrolled.'` message; asserts fetch was never called.

**Negative control (FAIL proof):**
```
$ git checkout HEAD -- src/policy/client.ts
$ edit: delete line 76 (if (!enrolment) throw ...)
$ npx vitest run tests/policy-client.test.ts
FAIL  | throws when not enrolled
AssertionError: expected to throw 'Not enrolled.' but got 'Cannot read properties of null (reading 'pseudo_id')'
```
Failure: without the guard, code tries to read `enrolment.pseudo_id` on `null`, throwing a different error. ✅ Test catches the bug.

**Restore:** re-added line 76, confirmed all 8/8 pass.

## Full suite result

```
$ npx vitest run
Test Files  31 passed (31)
     Tests  170 passed (170)
```

168 (baseline from Task 2, policy-client.test.ts initial 6 tests) + 2 (new tests) = 170. No regressions.
All tests in `tests/policy-client.test.ts` now pass 8/8 (6 existing + 2 new).

## Verification checklist

- ✅ Existing implementation (`src/policy/client.ts`) is **unmodified** and **unmodified** after all negative controls (git status confirmed).
- ✅ `npm vitest run tests/policy-client.test.ts` → 8 passing (6 existing + 2 new).
- ✅ Negative control 1 (non-OK): deleted line 64 → test FAILS with `expected undefined to be 1`; restored → passes.
- ✅ Negative control 2 (unenrolled): deleted line 76 → test FAILS with wrong error message; restored → passes.
- ✅ Full suite: 170/170 passing (31 files, no regressions).
- ✅ Commit message explains which architectural guarantee the new tests cover (ADR 0014: dead service never blocks).

---

# Task 3 (Plan C): Admin appeal review routes (2026-07-21)

⚠️ **Note on this file's history:** This section is the report for **Plan C Task 3**, as briefed in
`C:\Projects\Vanguard\.superpowers\sdd\task-3-brief.md`: add admin review routes to the FastAPI
governance service (list appeal queue, decide an appeal). This is a different task from the Plan A
and Plan B Task 3s above.

**Status: DONE**

- **Commit:** `ec37fe9` — `feat(policy): admin appeal review queue and decide (409 on re-decide)`
- **Author:** `HongHanTan <jasonthh123@gmail.com>` (git config untouched), no `Co-Authored-By`
  trailer.
- **Files:** `code/policy/app/routes/admin.py` (2 routes added), `code/policy/tests/test_appeals.py`
  (3 tests appended).

## What was implemented

Two new admin routes (after `decide_request`, before `usage`):

### `GET /v1/admin/appeals`
- Session-guarded via `_require_admin(vg_admin)` → 401 without valid session
- JOINs `employees` table to include `department` in response
- Returns appeal queue with `disclosed_text` (admin needs it when employee opted in to share)
- Ordered by `created_at DESC`

### `POST /v1/admin/appeals/{appeal_id}`
- Session-guarded via `_require_admin(vg_admin)`
- Body: `AppealDecision` model (Literal["upheld","overturned"], optional note ≤500 chars)
- Returns 404 for unknown appeal, 409 for already-decided (mirrors `decide_request` pattern)
- Updates `status`, `admin_note`, `decided_at` atomically
- Returns `{"status": decision}` on success

## TDD sequence and exact output

**Step 2: Failing tests (verify routes don't exist yet)**

Appended 3 tests to `test_appeals.py` and ran them:

```
.....FFF                                                                 [100%]

FAILED tests/test_appeals.py::test_admin_appeals_queue_requires_a_session - AssertionError: assert 404 == 401
FAILED tests/test_appeals.py::test_admin_sees_the_appeal_with_department_and_decides_it - TypeError: string indices must be integers
FAILED tests/test_appeals.py::test_deciding_twice_is_409 - AssertionError: assert 405 == 200

3 failed, 5 passed, 1 warning in 1.86s
```

✅ Failure confirmed: routes do not exist yet (404, 405, TypeError from missing GET response).

**Step 3: Implementation**
- Added `AppealDecision` to import in `admin.py` (line 30)
- Added `list_appeals()` (lines 241–251)
- Added `decide_appeal()` (lines 254–281)

**Step 4: Appeal tests (verify new tests pass)**

```
✓ tests/test_appeals.py (8 tests)
8 passed, 1 warning in 1.79s
```

✅ All 8 tests pass (5 existing employee tests + 3 new admin tests).

**Step 5: Full policy suite (verify no regressions)**

```
88 passed, 1 warning in 4.42s
```

✅ No regressions: 88 total (74 existing + 3 new appeal admin tests + 11 other tests).

## Key implementation details

### 404 vs. 409 split
Exactly mirrors the existing `decide_request` pattern (lines 198–214 of admin.py):
1. Check `WHERE id = ? AND org_id = ? AND status = 'pending'`
2. If no row found:
   - Check if appeal exists at all: `WHERE id = ? AND org_id = ?`
   - If doesn't exist → 404 "unknown appeal"
   - If exists but status ≠ 'pending' → 409 "appeal already decided"

This prevents silent re-decisions when the client retries after the server has already processed the admin's decision.

**Test proof:** `test_deciding_twice_is_409` verifies:
- First POST → 200, status updates to "upheld"
- Second POST with same appeal_id → 409 (appeal no longer pending)

### Session guard
`_require_admin(vg_admin)` throws 401 if no valid session cookie.

**Test proof:** `test_admin_appeals_queue_requires_a_session` verifies an unauthenticated GET returns 401.

### Department JOIN
`GET /v1/admin/appeals` JOINs `employees` to include `department` in response, matching the pattern of the existing `list_requests` route.

**Test proof:** `test_admin_sees_the_appeal_with_department_and_decides_it` asserts `mine[0]["department"] == "Engineering"`.

### Idempotency
`AppealDecision` uses `extra="forbid"` + `Literal["upheld","overturned"]` → invalid `decision` is 422 automatically (no manual validation needed, unlike the bare `Body` in `decide_request`).

## Constraints met

✅ Routes added after `decide_request`, before `usage` (no existing route reordering)  
✅ 404 for unknown appeal, 409 for already-decided (idempotency boundary, mirrors `decide_request`)  
✅ GET session-guarded (401 without valid vg_admin cookie)  
✅ GET joins employees for department  
✅ GET includes disclosed_text (admin needs it for context when employee shared it)  
✅ AppealDecision model used with `extra="forbid"` for invalid decisions → 422 automatically  
✅ No Co-Authored-By trailer in commit message  
✅ All appeal tests pass (8/8)  
✅ Full policy suite: 88 tests, no regressions  

## Deviations

None. Implementation follows the brief exactly:
- Code verbatim from brief (lines 241–281 in admin.py for the two routes)
- Tests verbatim from brief (lines 77–116 in test_appeals.py)
- Commit message as specified
- All constraints honored
- All code patterns match existing routes (404-vs-409 from `decide_request`, JOIN pattern from `list_requests`)

## Concerns

None. The implementation is complete, tested, and verified against regressions.
