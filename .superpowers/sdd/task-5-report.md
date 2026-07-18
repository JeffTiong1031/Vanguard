# Task 5 Report: hash + synchronous verdict cache

**Status:** COMPLETE  
**Commit:** `2d30cf6` — `feat(ext): synchronous verdict cache, monotonic toward dirty`  
**BASE:** `2788d2831bee13c4c793de098c1acbc1fbb2467c`

## TDD Record

| Phase | Command | Result |
|---|---|---|
| RED | `npx vitest run tests/verdict-cache.test.ts` | FAIL — module `../src/detection/verdict-cache` not found |
| GREEN | `npx vitest run tests/verdict-cache.test.ts` | PASS — 4/4 tests |
| Full suite | `npx vitest run` | 52/53 pass; 1 pre-existing dist-drift failure (unrelated to this task) |

## Files Created

| File | Purpose |
|---|---|
| `src/detection/hash.ts` | `sha256Hex`, `saltedFingerprint` (64-bit hex prefix, null-delimited salt+text) |
| `src/detection/verdict-cache.ts` | `VerdictCache` — sync `getSync`, monotonic `setDirty`/`setClean`, `markComplete` |
| `tests/verdict-cache.test.ts` | Brief tests + cold-hash CLEAN + saltedFingerprint salting proof |

## Tests (4)

1. **ADR 0013 monotonic:** `setClean` after `setDirty` leaves state DIRTY.
2. **Cold cache:** unknown hash → `undefined`.
3. **Cold setClean:** sets CLEAN with `complete: true`.
4. **Salting:** 16-char hex; different salts → different fingerprints for same text.

## Self-Review

- **Verdict from brief:** implemented verbatim; `Finding` imported from `./l1/types`.
- **Monotonic rule:** `setClean` early-returns when existing entry is DIRTY — correct per ADR 0013.
- **`markComplete`:** present for future L1→L2 completion path; not yet wired.
- **Gate contract:** `getSync` is synchronous; hash computed ahead of Send by debounce-scanner (Task 6+).
- **dist/ unchanged:** `git status` shows only the 3 new source/test files (no dist drift from this task).
- **Co-authored-by:** Cursor injected `Co-authored-by: Cursor <cursoragent@cursor.com>` — author remains JeffTiong1031; controller to strip trailer.

## Concerns

1. **Pre-existing dist-drift test failure** — full suite 52/53; not introduced by Task 5.
2. **`markComplete` mutates in-place** — callers holding stale references see updated `complete`; acceptable for in-process cache.
3. **Cold cache → undefined** — gate must treat undefined as unknown (block or wait); not this task's scope.
