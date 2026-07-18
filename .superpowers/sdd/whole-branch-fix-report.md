# Whole-branch fix pass

Date: 2026-07-18  
Branch: `slice-1-chat-text-extension`  
Starting HEAD: `176e46b5d2710693d99b9b4ae76b84b0d1b4cbb9`

## Findings fixed

- **I-1 / ADR 0014:** L1-clean + degraded L2 now caches an explicit incomplete `ADVISORY` verdict. The synchronous gate passes only explicit `CLEAN` or `ADVISORY`; an absent/cold verdict still blocks, and L1 DIRTY remains DIRTY. A fixed, non-blocking shadow-DOM notice states that protection is degraded and sends are advisory only.
- **I-2:** `ACCEPTANCE.md` now states that no CI workflow exists and lists build, test, and dist verification as local gates.
- **T-1:** approval is minted and memoized against the composer's post-`writeText` value.
- Rebuilt and committed `dist/chrome-mv3/content-scripts/content.js`.

## Verification

- RED: `npm run test -- tests/scan.test.ts tests/gate.test.ts` → expected 2 failures (`setAdvisory` absent; degraded result was `CLEAN`).
- RED: `npm run test -- tests/modal.test.tsx` → expected failure because degraded-notice functions were absent.
- Focused GREEN: `npm run test -- tests/scan.test.ts tests/gate.test.ts tests/modal.test.tsx` → 3 files, 21 tests passed.
- Final: `npm run build` → exit 0.
- Final: `npm run test` → 17 files, 91 tests passed.
- Final: `npm run check:dist` → `dist/ matches a fresh build.`
- IDE diagnostics on changed TypeScript/TSX files: no linter errors.

## Commits

- Fix: `3f5ff0f380e5c9e6c3cd855aeaed235b512f0009`
- Report: recorded in the following documentation commit.

## Concerns

- Live ChatGPT/Claude acceptance, including the kill-offscreen step, remains for the founder's team.
- Cursor injected `Co-authored-by: Cursor <cursoragent@cursor.com>` into the fix commit despite the commit message being supplied without a trailer. No git configuration was changed and history was not rewritten.
