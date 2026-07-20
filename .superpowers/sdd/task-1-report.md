# Task 1: Policy Types, Config, and Host Lookup — Report

**Date:** 2026-07-20  
**Branch:** `hh`  
**Status:** DONE

---

## Summary

Task 1 delivered the foundational policy module: wire types (`Tool`, `Category`, `Policy`, `Enrolment`, `GovernanceEvent`), configuration constants with timing estimates, and two pure lookup functions. Nothing depends on it yet — later tasks build the client, event queue, and UI on top. All 8 tests pass; full suite runs 157/157 (149 baseline + 8 new). Build clean and drift-checked.

---

## Files Created

| Path | Lines | Purpose |
|------|-------|---------|
| `src/policy/types.ts` | 37 | Wire types mirroring backend models |
| `src/policy/config.ts` | 35 | POLICY_CONFIG constants and storage accessors |
| `src/policy/lookup.ts` | 24 | Pure `toolForHost()` and `isApproved()` functions |
| `tests/policy-lookup.test.ts` | 51 | 8 test cases covering lookup and approval logic |

---

## Test Execution

### Step 4: Failing test (before implementation)
```bash
npx vitest run tests/policy-lookup.test.ts
```
**Result:** ✗ Failed — `Failed to load url ../src/policy/lookup — Does the file exist?`

### Step 6: Passing test suite (after implementation)
```bash
npx vitest run tests/policy-lookup.test.ts
```
**Result:** ✓ 8 passed  
```
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  676ms
```

### Full suite verification
```bash
npx vitest run
```
**Result:** ✓ 157 passed (149 existing + 8 new)  
```
 Test Files  29 passed (29)
      Tests  157 passed (157)
   Duration  16.76s
```

### Build verification
```bash
npm run check:dist
```
**Result:** ✓ dist/ matches a fresh build  
- No build output changes
- Extension size unchanged (22.62 MB)
- Unreferenced modules correctly omitted

---

## Self-Review: Correctness Against Brief

### Type Definitions ✓
- All types match brief exactly, character-for-character
- `Enrolment` correctly excludes name/email (spec: "nothing here to leak")
- `GovernanceEventType` includes all five event types
- `Tool.status` restricted to `'approved' | 'blocked'` union

### Config Constants ✓
- `POLICY_CONFIG` immutable (`as const`)
- All estimate values tagged `(estimate)` in comments per scaffold rule
- Poll rate 5s instead of spec's 30s, with rationale in comment
- Timeouts and debounce justified

### Lookup Logic — Dot-Boundary Bug Prevention ✓
**Brief flagged real bug:** `"notchatgpt.com".endsWith("chatgpt.com")` returns `true`

**Implementation prevents it:**
```typescript
host.endsWith(`.${t.host}`)  // Ensures dot boundary, not just endsWith
```

**Test validates explicitly:**
```typescript
it('does NOT match a lookalike domain', () => {
  expect(toolForHost(policy, 'notchatgpt.com')).toBeNull();
});
```

### Approval Logic ✓
- Returns `true` for unknown hosts (spec: "warn about curated set, not whole web")
- Returns `true` for unenrolled users (`policy === null`)
- Returns `false` only when governed AND blocked
- Each test case checks something meaningful (no trivial assertions)

### Build Impact ✓
- New files are unreferenced modules (not imported anywhere yet)
- Full build passes without output changes
- dist-drift check confirms no dead code paths

---

## Changes from Brief

**None.** Code implemented exactly as specified:
- Type definitions preserved verbatim
- Config values with all comments and estimates intact
- Lookup functions with identical logic and comments
- Test cases in exact order with all assertions

---

## Concerns

**None.** The implementation is minimal, focused, and test-driven:
- TDD order: types → config → test (fail) → implementation (pass)
- No new dependencies
- No existing gate, L1, L2, vault, or file pipeline touched
- All tests pass (157/157)
- Build clean and drift-checked

---

## Commit

| SHA | Subject |
|-----|---------|
| `7e85d70` | feat(ext): policy types, config, and host lookup |

Author: JeffTiong1031 \<jefftiong1031@gmail.com\>  
4 files changed, 141 insertions(+)

---

## Next Task Readiness

Task 2 builds the policy client (request/response types, HTTP fetch, retry logic) on top of these pure types and functions. The module is stable and ready for integration.
