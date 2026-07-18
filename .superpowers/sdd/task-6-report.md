# Task 6 Report — L1+L2 scan orchestration

## Status
**COMPLETE** — RED → GREEN → full suite green → committed.

## TDD record
| Phase | Result |
|---|---|
| **RED** | `tests/scan.test.ts` failed: `Failed to load url ../src/detection/scan` (module missing) |
| **GREEN** | 5/5 scan tests pass after `scan.ts` transcribed verbatim from brief |

## Files
- `code/extension/src/detection/scan.ts` — `scanInto()` orchestrates L1 → L2 with ADR 0013 short-circuit and ADR 0014 degrade
- `code/extension/tests/scan.test.ts` — 5 tests (2 from brief + 3 controller additions)

## Tests (5)
1. **L1 hit → DIRTY before L2** — NRIC in `IC 890101-14-5555`
2. **L1-clean + L2 PERSON → DIRTY** — default mock returns PERSON entity
3. **L1 hit + L2 degraded → DIRTY preserved** — `mockResolvedValueOnce('degraded')`; cache.getSync(hash).state === 'DIRTY'
4. **L1-clean + L2 degraded → CLEAN incomplete, no cache entry** — returns `{ state:'CLEAN', complete:false }`; cache.getSync(hash) === undefined
5. **L1-clean + L2 empty → CLEAN complete** — `mockResolvedValueOnce([])`; cache.getSync(hash).state === 'CLEAN', complete:true

## Full suite
58/58 pass (11 files). No regression. `dist/` unchanged.

## Commit
`b5cc31d` — `feat(ext): L1+L2 scan orchestration with ADR 0013/0014 rules`

## Self-review — degraded path never fabricates cached CLEAN
**Verified.** On `l2 === 'degraded'`:
- `setClean` is **never** called
- `markComplete` is **never** called
- L1-dirty path: prior `cache.setDirty(hash, l1)` remains; return is cache entry (DIRTY)
- L1-clean path: no cache write; return is ephemeral `{ state:'CLEAN', findings:[], complete:false }` — hash stays unknown in cache

This matches ADR 0014: degraded never upgrades to a completed CLEAN verdict.

## Concerns
- **None blocking.** `scanInto` is not yet wired to any entrypoint (by design for this task).
- Degraded return object is not cached — callers must treat `complete:false` as advisory-only; downstream wiring should surface degradation explicitly.
