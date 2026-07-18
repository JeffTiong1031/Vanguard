# Task 2 Report — `dist/`-matches-`src/` drift check

**Branch:** `slice-1-chat-text-extension`  
**Base:** `0158ce4847bd9971011042881de9d81a071e48be`  
**Commit:** `41fd56e68a63a36487da62596cc371b45468c562`  
**Message:** `feat(ext): fail CI when committed dist drifts from src`

## Summary

Replaced the Task 1 stub (`check-dist-drift.mjs` always exit 0) with a full checker that rebuilds to a temp directory, SHA-256-hashes every file under `dist/chrome-mv3`, compares to the committed tree, and exits 1 on drift. Added vitest config and an integration test per the brief.

## Files changed

| File | Action |
|---|---|
| `code/extension/scripts/check-dist-drift.mjs` | Replaced stub with full checker |
| `code/extension/tests/dist-drift.test.ts` | Created (verbatim from brief) |
| `code/extension/vitest.config.ts` | Created |

## TDD evidence

### RED

1. **Stub false PASS (pre-implementation):** With Task 1 stub in place, `npx vitest run tests/dist-drift.test.ts` → **PASS** (1/1). The stub exits 0 without verifying; the brief's test only asserts non-throw, so this is a known false green — documented, not a substitute for real verification.

2. **Full checker, brief's `npx` spawn (post-implementation, pre-fix):** After implementing the brief's `execFileSync('npx', ['wxt', 'build', '--outDir', tmp])` variant → `npx vitest run tests/dist-drift.test.ts` → **FAIL** (1/1):
   - `Error: spawnSync npx ENOENT` (Windows: `npx` is not a direct executable for `execFileSync`).

### GREEN

After fixes (see Deviations):
```text
npm run build && npx vitest run tests/dist-drift.test.ts
→ PASS (1/1), test ~2.5s (includes fresh WXT build in temp dir)
```

Manual drift verification:
```text
appendFileSync('dist/chrome-mv3/manifest.json', 'x')
node scripts/check-dist-drift.mjs
→ exit 1, stderr: "dist/ is stale... Drifted:\nmanifest.json"
npm run build  # restored committed dist
```

## Deviations from brief (documented)

### 1. WXT `--outDir` CLI flag — `[verify]` FAILED

`npx wxt build --help` (WXT 0.19.29) lists no `--outDir` flag.

**Working alternative:** Generate `.wxt-drift.config.mjs` in the extension cwd (so `import 'wxt'` resolves), set `outDir` to a temp dir via `defineConfig`, run `wxt build --config .wxt-drift.config.mjs`, delete config in `finally`. Fresh output lands at `<tmp>/chrome-mv3` as expected.

### 2. `execFileSync('npx', ...)` — Windows ENOENT

**Fix:** `execFileSync(process.execPath, [join(process.cwd(), 'node_modules/wxt/bin/wxt.mjs'), 'build', '--config', driftConfigPath], ...)`.

Hashing logic, `COMMITTED`, `--write` early exit, drift message, and exit codes match the brief verbatim.

## Self-review

| Check | Result |
|---|---|
| `--write` postbuild no-op | OK — exits 0; `postbuild` runs after `wxt build` already wrote `dist/` |
| Default mode verifies | OK — rebuilds to temp, compares SHA-256 manifest |
| Drift exits 1 with file list | OK — verified manually |
| In-sync exits 0 + success log | OK — `dist/ matches a fresh build.` |
| Scope | OK — no L2/offscreen changes |
| vitest from `code/extension` | OK — `vitest.config.ts` + `npm test` / `npx vitest run` |
| Committed files only | OK — 3 files per brief; no `dist/` delta in commit |

## Concerns

- **Stub RED was a false PASS:** Brief test does not assert checker output; stub satisfied it. Real RED came from full implementation hitting `spawnSync npx ENOENT`.
- **Ephemeral `.wxt-drift.config.mjs`:** Written to cwd during verify; cleaned in `finally`. If process is killed mid-build, orphan config possible (low risk; gitignored path would be cleaner in a follow-up).
- **No `Co-Authored-By` trailer** in commit `41fd56e`.

## Commands for replay

```bash
cd code/extension
npx vitest run tests/dist-drift.test.ts
npm run check:dist
npm run build && npx vitest run tests/dist-drift.test.ts
```

---

## Review fix (Findings 1 + 2)

**Commit:** `229c5740e820c03211b79220b0a36505fd691efb`  
**Message:** `fix(ext): test drift is detected; drift build reuses real config`  
⚠️ **Cursor injected `Co-authored-by: Cursor <cursoragent@cursor.com>`** — controller should strip.

### Finding 1 — negative drift detection

- Exported `hashTree` + `diffTrees` from `check-dist-drift.mjs` (CLI and tests share the same comparison).
- Added tests:
  1. **Positive (unchanged):** in-sync shell-out exits 0.
  2. **Negative (unit):** temp copy of `dist/chrome-mv3`, mutate `manifest.json` by one byte → `diffTrees` must include `manifest.json`.
  3. **Negative (CLI):** temporarily append a byte to committed `manifest.json`, assert `check-dist-drift.mjs` throws (non-zero), restore in `finally`. `afterAll` asserts `git status --porcelain code/extension/dist` is empty.

#### RED evidence (broken detector)

Temporarily forced `diffTrees` to `return []`:

```text
npx vitest run tests/dist-drift.test.ts -t "detects drift"
→ FAIL
AssertionError: expected [] to include 'manifest.json'
```

#### GREEN evidence (restored)

```text
npx vitest run tests/dist-drift.test.ts
→ PASS (3/3)
  ✓ committed dist matches a fresh build (~2.5s)
  ✓ detects drift when an output file byte differs
  ✓ exits non-zero when committed dist is stale, then restores it (~2.5s)
```

After the suite: `git status --porcelain code/extension/dist` → **empty** (dist byte-for-byte unchanged).

### Finding 2 — drift config reuses real config

Generated `.wxt-drift.config.mjs` is now:

```js
import base from './wxt.config.ts';
export default {
  ...base,
  outDir: <tmp>,
};
```

Manifest is no longer duplicated. Still cleaned in `try/finally`.

### Minor

- Missing `dist/chrome-mv3` → friendly stderr + exit 1.
- Orphan config cleanup already in `finally` (unchanged; verified absent after runs).
