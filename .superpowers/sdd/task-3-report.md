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
