# Task 14 Review — end-to-end acceptance checklist

**Spec: ✅**

**Quality: Approved with residuals**

## Spec verification

| Requirement | Status |
|-------------|--------|
| Create `code/extension/ACCEPTANCE.md` | ✅ 71-line file at expected path |
| Brief checklist preserved verbatim (Setup + Real flow + Invariants) | ✅ Line-for-line match against `task-14-brief.md` |
| Controller: residual risks written | ✅ R1–R3, Task 8, Task 12 minors, Task 13 note |
| Controller: automated build/test run | ✅ Report + independent re-run: `build` / `check:dist` / `test` exit 0 (17 files, 89 tests) |
| Controller: live boxes unchecked, DEFERRED_MANUAL | ✅ Header status + all `[ ]` unchecked; report states team test |
| No fabricated live PASS | ✅ No checked live boxes; sign-off table empty |
| Commit `8ff8e38` message | ✅ `docs(ext): Slice 1 end-to-end acceptance checklist` |
| Single-file diff | ✅ Only `ACCEPTANCE.md` (+71) |

Brief Step 1 also names *"run it on BOTH surfaces"*; controller resolution #4 correctly overrides — live run deferred, not spec failure for this docs-only gate.

## Automated verification (reviewer re-run, 2026-07-18)

```
npm run build          → exit 0 (~3.5 s, 22.57 MB)
npm run check:dist     → exit 0 ("dist/ matches a fresh build")
npm run test           → exit 0 (17 passed, 89 passed)
```

Matches task report counts.

## Findings

1. **Process — `Co-authored-by: Cursor` on `8ff8e38`.** CLAUDE.md §6.1 and founder rule: sole attribution to `JeffTiong1031`; omit the trailer. Amend before branch merge / whole-branch review (HANDOFF item 4). Does not invalidate the checklist artifact.

2. **Minor doc inaccuracy — "run in CI".** ACCEPTANCE.md line 5 says automated gates *"are run in CI"*. Repo has no `.github/workflows`; gates were run locally and recorded in the report. Rephrase to *"recorded in the Task 14 report / run locally"* or add CI later.

3. **Important carry-forward — advisory criterion vs current code.** Checklist rows (kill offscreen → *"protection degraded"*) and R1 mirror ADR 0014 / slice-1 plan verbatim (correct for an acceptance definition). Implementation gap from earlier tasks: no user-facing *"protection degraded"* string exists; `scanInto` on L2 `'degraded'` returns incomplete CLEAN without caching; `decideGate` then treats the hash as cold → BLOCK → `onBlocked` returns early when no cache entry → **send swallowed, no modal, no pass-through**. L1-dirty + degraded still blocks (L1 cache). Team test will likely **fail** the offscreen-kill row on clean sends until advisory UI + pass-through land — checklist is right as the *target*, not as a description of today's behavior. Not a Task 14 spec miss; flag for whole-branch review.

4. **Positive — residual integration.** HANDOFF items 1–6 (ORT/COOP, hash-pin CDN, live selectors, cold-cache swallow, innerText hash round-trip, cross-tab audit) are explicitly surfaced with unchecked boxes; sign-off criteria name R1/R2/Task 8/Task 12; R3/Task 13 correctly scoped skip/note.

5. **Checklist accuracy (static).** Modal `cls: count` format (`PERSON: 1`, `NRIC: 1`, `EMAIL: 1`) matches `modal.tsx` + `summarise()`. Paste fixture hits L1 NRIC + EMAIL per unit tests. Einstein FP and `1+1` guardrail align with ADR 0017 / `guardrail.test.ts`. U12-b IME row is manual-only (expected).

## Summary

Task 14 delivers the Slice 1 acceptance definition correctly: brief checklist verbatim, residual risks and sign-off added, live boxes honestly deferred, build/test verified — amend the co-authored commit trailer before merge and expect the advisory-degradation row to fail live until ADR 0014 surfacing is implemented.
