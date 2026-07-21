# Task 5 Report: host_permissions swap + rebuild dist

## What I implemented

1. **Step 1 — wxt.config.ts edit.** In `code/extension/wxt.config.ts`, replaced the placeholder
   `'https://vanguard-extract.example.com/*',` with `'https://vanguard-extract.onrender.com/*',`
   in the `host_permissions` array. This is the only line changed in the file — the surrounding
   comment (`// [set this to the founder-hosted team-test origin before the team test]`), the
   `localhost:8000` / `127.0.0.1:8000` entries above it, and the "Policy service (Plan A)" block
   below it are all untouched.

2. **Step 2 — rebuild.** Ran `npm run build` in `code/extension/`. Build succeeded (WXT 0.19.29,
   Vite 5.4.21, chrome-mv3, production). The `postbuild` hook (`node scripts/check-dist-drift.mjs
   --write`) ran automatically and rewrote `dist/chrome-mv3/` to match the new source.

3. **Step 3 — drift check.** Ran `npm run check:dist`. Result: `dist/ matches a fresh build.`
   (clean, no drift — see verbatim output below).

4. **Step 4 — grep verification.** `grep -c "vanguard-extract.onrender.com"
   code/extension/dist/chrome-mv3/manifest.json` → `1`, matching the expected count.

5. **Step 5 — full test suite.** Ran `npx vitest run`. All 46 test files / 318 tests passed,
   including `tests/dist-drift.test.ts`'s "committed dist matches a fresh build" case — this is
   the test that was failing pre-rebuild (per the task framing, dist was previously stale) and is
   now green because the rebuild in Step 2 brought dist back in sync with source.

6. **Step 6 — commit.** Staged only `code/extension/wxt.config.ts` and `code/extension/dist`,
   committed as `2bbb03d` with message `feat(ext): permit hosted file-extract origin; rebuild
   dist`, no `Co-Authored-By` trailer (verified via `git log -1 --format="%an <%ae>%n%B"` — sole
   author `JeffTiong1031 <jefftiong1031@gmail.com>`).

## Full command output

### `npm run build`

```
> build
> wxt build

WXT 0.19.29
ℹ Building chrome-mv3 for production with Vite 5.4.21
- Preparing...
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✔ Built extension in 8.889 s
  ├─ dist\chrome-mv3\manifest.json                                 1.39 kB
  ├─ dist\chrome-mv3\offscreen.html                                367 B
  ├─ dist\chrome-mv3\options.html                                  569 B
  ├─ dist\chrome-mv3\popup.html                                    494 B
  ├─ dist\chrome-mv3\background.js                                 16.26 kB
  ├─ dist\chrome-mv3\chunks\_virtual_wxt-html-plugins-DPbbfBKe.js  779 B
  ├─ dist\chrome-mv3\chunks\hooks.module-BvJaI_xB.js               13.25 kB
  ├─ dist\chrome-mv3\chunks\offscreen-C3f-neeN.js                  882.68 kB
  ├─ dist\chrome-mv3\chunks\options-DnySgAor.js                    6.49 kB
  ├─ dist\chrome-mv3\chunks\popup-CB8tq0nZ.js                      2.94 kB
  ├─ dist\chrome-mv3\chunks\sensitivity-D8Ld3zRE.js                2.47 kB
  ├─ dist\chrome-mv3\content-scripts\content.js                    581.03 kB
  ├─ dist\chrome-mv3\content-scripts\guard.js                      19.09 kB
  ├─ dist\chrome-mv3\ort\ort-wasm-simd-threaded.jsep.mjs           44.61 kB
  └─ dist\chrome-mv3\ort\ort-wasm-simd-threaded.jsep.wasm          21.6 MB
Σ Total size: 23.17 MB
✔ Finished in 9.232 s

> postbuild
> node scripts/check-dist-drift.mjs --write
```

(postbuild's own stdout was consumed by the `--write` pass; the standalone `check:dist` run below
is the authoritative verification.)

### `npm run check:dist` (verbatim — this is the correctness gate for this task)

```
> check:dist
> node scripts/check-dist-drift.mjs

WXT 0.19.29
ℹ Building chrome-mv3 for production with Vite 5.4.21
- Preparing...
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✔ Built extension in 8.165 s
  ├─ ...\chrome-mv3\manifest.json                                 1.39 kB
  ├─ ...\chrome-mv3\offscreen.html                                367 B
  ├─ ...\chrome-mv3\options.html                                  569 B
  ├─ ...\chrome-mv3\popup.html                                    494 B
  ├─ ...\chrome-mv3\background.js                                 16.26 kB
  ├─ ...\chrome-mv3\chunks\_virtual_wxt-html-plugins-DPbbfBKe.js  779 B
  ├─ ...\chrome-mv3\chunks\hooks.module-BvJaI_xB.js               13.25 kB
  ├─ ...\chrome-mv3\chunks\offscreen-C3f-neeN.js                  882.68 kB
  ├─ ...\chrome-mv3\chunks\options-DnySgAor.js                    6.49 kB
  ├─ ...\chrome-mv3\chunks\popup-CB8tq0nZ.js                      2.94 kB
  ├─ ...\chrome-mv3\chunks\sensitivity-D8Ld3zRE.js                2.47 kB
  ├─ ...\chrome-mv3\content-scripts\content.js                    581.03 kB
  ├─ ...\chrome-mv3\content-scripts\guard.js                      19.09 kB
  ├─ ...\chrome-mv3\ort\ort-wasm-simd-threaded.jsep.mjs           44.61 kB
  └─ ...\chrome-mv3\ort\ort-wasm-simd-threaded.jsep.wasm          21.6 MB
Σ Total size: 23.17 MB
✔ Finished in 8.323 s
dist/ matches a fresh build.
```

Result: **PASS — no drift.**

### Grep verification

```
$ grep -c "vanguard-extract.onrender.com" code/extension/dist/chrome-mv3/manifest.json
1
```

Matches expected `1`.

### `npx vitest run` (summarized)

```
 Test Files  46 passed (46)
      Tests  318 passed (318)
   Duration  29.82s
```

All 46 test files / 318 tests passed. `tests/dist-drift.test.ts` (3 tests) passed, including
`dist drift > committed dist matches a fresh build` (17.3s) and `dist drift > exits non-zero when
committed dist is stale, then restores it` (10.6s) — this is the test that would have failed had
the rebuild not actually landed the new dist.

## Files changed

- `code/extension/wxt.config.ts` — one line (origin swap).
- `dist/ rebuilt, 8 files changed` (per the commit): `manifest.json`, `content-scripts/content.js`,
  `offscreen.html`, `options.html`, `ort/ort-wasm-simd-threaded.jsep.mjs`,
  `chunks/_virtual_wxt-html-plugins-DPbbfBKe.js` modified; `chunks/options-D8MuHELv.js` deleted and
  `chunks/options-DnySgAor.js` added (a WXT content-hash rename of the same options chunk, not a
  functional change).

Commit: `2bbb03d` — `feat(ext): permit hosted file-extract origin; rebuild dist`.

## Self-review findings

- **Comment and localhost/127.0.0.1 entries preserved.** Confirmed by reading the file before and
  after the edit — only the one target line changed; the `// [set this to the founder-hosted
  team-test origin before the team test]` comment and both `localhost:8000` / `127.0.0.1:8000`
  entries are byte-identical to before.
- **manifest.json inside rebuilt dist actually contains the new origin**, not just source: verified
  via the Step 4 grep against the rebuilt `dist/chrome-mv3/manifest.json` (count = 1), and via a
  `git diff` of the manifest which shows the *only* content change is
  `vanguard-extract.example.com` → `vanguard-extract.onrender.com` inside `host_permissions` (plus
  a trailing-newline normalization already present from the build tool, not from a manual edit).
- **check:dist genuinely clean.** Re-read the full output rather than trusting exit code alone —
  final line reads `dist/ matches a fresh build.` with no diff/warning lines above it (only Vite's
  unrelated chunk-size advisory, which is pre-existing and orthogonal to this task).
- **Scope discipline.** `git status` before staging showed two pre-existing unrelated modifications
  (`code/extension/ACCEPTANCE.md`, `code/policy/pyproject.toml`) already present in the working
  tree at session start (per the git status snapshot in the task context). I did not stage or
  touch either — only `code/extension/wxt.config.ts` and `code/extension/dist` were added and
  committed, per the brief's Code Organization constraint.
- **No hand-editing of dist/.** All dist changes came from `npm run build`'s own output; nothing
  under `dist/` was edited directly.
- **Commit attribution.** Verified post-commit: sole author `JeffTiong1031
  <jefftiong1031@gmail.com>`, no `Co-Authored-By` trailer, per this repo's CLAUDE.md §6.1
  convention.

## Issues or concerns

None. Build, drift check, grep check, and full test suite all passed cleanly on the first attempt;
no investigation or workaround was needed.
