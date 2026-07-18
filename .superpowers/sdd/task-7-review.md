# Task 7 review — window-capture gate (ADR 0010 / U12-b / decision #8)

**Verdict: APPROVED.** Spec-compliant; all four verification gates pass. One Minor quality note only.

**Diff reviewed:** `b5cc31d` → `de092ec` (2 files, 105 insertions)

---

## 1. Spec compliance

✅ **Scope.** Commit touches exactly the two brief files: `gate.ts`, `gate.test.ts`. No dist or unrelated churn.

✅ **`decideGate` — exact approval equality.** Line 15: `if (a.approvedHash === a.hash) return 'PASS'` runs before cache lookup. DIRTY + mismatched approval falls through to `v.state === 'CLEAN' ? 'PASS' : 'BLOCK'` → BLOCK. CLEAN → PASS. Cold (`!v`) → BLOCK. Matches brief Step 2 verbatim.

✅ **`installGate` — capture, IME, path, BLOCK semantics.** Handler order: `eventPhase !== CAPTURING_PHASE` → `KeyboardEvent && isComposing` early-return (before send-intent / decide) → `composedPath()` → sync `decideGate`. On BLOCK: both `stopImmediatePropagation()` and `preventDefault()` before `onBlocked`. Registered on `window` for `keydown` and `click` with `{ capture: true }`.

✅ **Synchronous read (decision #8).** Handler path has no `await`; `decideGate` uses `cache.getSync` only. `hashOf` contract documented as sync in `GateDeps`.

✅ **Cold cache fail-safe (not fail-closed).** Unknown hash → BLOCK; brief documents modal/onBlocked as forward path. Not ADR 0014 fail-closed.

✅ **Tests beyond brief (acceptable).** Two controller additions: DIRTY + mismatched `approvedHash` → BLOCK; CLEAN regardless of `approvedHash`. Both load-bearing for hash-bound approval.

**Gaps:** None blocking.

---

## 2. Verification checklist (requested gates)

| # | Check | Result |
|---|---|---|
| 1 | `decideGate`: exact `approvedHash === hash`; DIRTY+different → BLOCK; CLEAN → PASS; cold → BLOCK; tests cover all | ✅ 6 pure tests; all four brief cases + mismatch + CLEAN/approval independence |
| 2 | `installGate`: capture guard; `isComposing` before decide; `composedPath()`; BLOCK calls both stop + preventDefault; keydown+click `{capture:true}` | ✅ Code matches brief; registration test asserts both listeners |
| 3 | No `await` in handler path | ✅ |
| 4 | Scope: `gate.ts` + `gate.test.ts` only | ✅ |

---

## 3. Findings

### Minor — `installGate` handler behavior not exercised in tests

The single `installGate` test stubs `window.addEventListener` and asserts registration only. It does not dispatch synthetic events to verify `isComposing` pass-through, `stopImmediatePropagation`/`preventDefault` on BLOCK, or capture-phase guard. **Pure `decideGate` covers the verdict logic; handler wiring matches the brief verbatim** (transcribed from U12-proven spike). Acceptable for this task; behavioral spies would strengthen regression coverage when wiring to content-script entrypoint.

---

## 4. Task quality

| Dimension | Result |
|---|---|
| Spec compliance | ✅ |
| Hash-bound approval (exact equality) | ✅ |
| IME `isComposing` early-return (U12-b) | ✅ |
| BLOCK: stopImmediatePropagation + preventDefault | ✅ |
| Sync verdict read (no await) | ✅ |
| Scope discipline | ✅ |
| **Overall** | **Approved** |

No Critical or Important issues. Safe to merge from a task-scoped gate perspective.
