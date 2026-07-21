# Task 4: Extension sends the bearer token — Report

## Implementation Summary

Implemented the extension-side bearer token gate for file-checking requests. The extension now sends a shared demo bearer token (`REPLACE_WITH_DEMO_TOKEN`) on all file requests (`/v1/extract` and `/v1/redact`), and defaults to a hosted Render URL instead of localhost.

## Files Changed

1. **code/extension/src/files/config.ts**
   - Added `DEMO_TOKEN` export with value `'REPLACE_WITH_DEMO_TOKEN'` (placeholder per brief)
   - Updated `DEFAULT_BASE` from `'http://localhost:8000'` to `'https://vanguard-extract.onrender.com'`
   - Added comment explaining Path A demo host and the team-test context

2. **code/extension/src/files/api.ts**
   - Updated import to include `DEMO_TOKEN` from config
   - Modified `extractFile` to send `Authorization: Bearer ${DEMO_TOKEN}` header alongside existing `x-vanguard-filename` header
   - Modified `redactFile` to send `Authorization: Bearer ${DEMO_TOKEN}` header on the `/v1/redact` POST request

3. **code/extension/tests/files/api.test.ts**
   - Added new `describe('demo bearer token', ...)` block with test asserting `Authorization: Bearer .+` header is sent on extract

## TDD Evidence

### RED: Test Fails (Step 2)
```
Command: cd code/extension && npx vitest run tests/files/api.test.ts

Output:
❯ demo bearer token > sends Authorization: Bearer on extract
  → .toMatch() expects to receive a string, but got undefined

Failed Tests 1
FAIL tests/files/api.test.ts > demo bearer token > sends Authorization: Bearer on extract
TypeError: .toMatch() expects to receive a string, but got undefined
  ❯ tests/files/api.test.ts:60:35

Test Files: 1 failed
Tests: 1 failed | 4 passed (5)
```

**Why it fails:** `extractFile` currently sends only the `x-vanguard-filename` header; the `Authorization` header is not set, so `headers.Authorization` is undefined.

### GREEN: Tests Pass (Step 5)
```
Command: cd code/extension && npx vitest run tests/files/api.test.ts

Output:
✓ tests/files/api.test.ts (5 tests) 30ms

Test Files: 1 passed (1)
Tests: 5 passed (5)
```

All 5 tests pass:
- 1 new bearer token test (new)
- 4 existing extractFile tests (unchanged)

### Full Test Suite Validation
```
Command: cd code/extension && npx vitest run tests/files/

Output:
✓ tests/files/store.test.ts (6 tests)
✓ tests/files/cleaned.test.ts (5 tests)
✓ tests/files/api.test.ts (5 tests)
✓ tests/files/pipeline.test.ts (5 tests)
✓ tests/files/attach.test.ts (2 tests)
✓ tests/files/capture.test.ts (5 tests)
✓ tests/files/gate-files.test.ts (3 tests)

Test Files: 7 passed (7)
Tests: 31 passed (31)
```

All 31 tests across 7 files pass, confirming no regressions.

## Implementation Details

### Bearer Token Value
- Uses exact placeholder from brief: `'REPLACE_WITH_DEMO_TOKEN'`
- Exported from config.ts for use in api.ts
- Comment documents it as a casual-abuse deterrent for the public host, not a secret
- Notes that it ships in the private repo build and will be replaced at deploy time (Task 7)

### API Base URL
- Changed from `http://localhost:8000` to `https://vanguard-extract.onrender.com`
- Comment clarifies that local dev should override via Options (storing `http://localhost:8000` in `vg_api_base`)
- Explains that the real onrender.com URL will be substituted at deploy time (Task 7)

### Header Implementation
Both `/v1/extract` and `/v1/redact` requests now send:
```
Authorization: Bearer REPLACE_WITH_DEMO_TOKEN
```

The implementation:
- Does not modify request body or other headers
- Maintains backward compatibility with the existing x-vanguard-filename header on extract
- Uses const interpolation: `Authorization: \`Bearer ${DEMO_TOKEN}\``

### Test Assertion
The new test:
1. Calls `extractFile` with a mock fetch stubbed to return 200
2. Captures the fetch spy
3. Extracts the RequestInit from the spy's call arguments
4. Asserts that `headers.Authorization` matches the regex `/^Bearer .+/`
5. Confirms that the token value is actually being sent (not just the word "Bearer")

## Commit

**Hash:** `7be5199`
**Message:** `feat(ext): send shared demo bearer token on file routes; default to hosted API`

Files staged and committed exactly as specified in the brief:
- `code/extension/src/files/config.ts`
- `code/extension/src/files/api.ts`
- `code/extension/tests/files/api.test.ts`

No `Co-Authored-By` trailer added (per repo convention).

## Self-Review Findings

✅ **Completeness:** All three files modified exactly as specified in brief
✅ **Placeholder values:** Both `REPLACE_WITH_DEMO_TOKEN` and `vanguard-extract.onrender.com` used verbatim
✅ **Comments:** Exact text from brief, including context about Path A and Task 7
✅ **Test quality:** New test asserts on the Authorization header value, not just fetch invocation
✅ **Existing tests:** All 4 existing api.test.ts tests still pass
✅ **Extended validation:** All 31 tests in tests/files/ pass (7 test files)
✅ **Discipline:** No changes to wxt.config.ts, dist/, or any other files
✅ **TDD:** Clear RED → GREEN cycle demonstrated

## No Issues or Concerns

The implementation is complete and correct. All requirements from the brief have been satisfied and verified.
