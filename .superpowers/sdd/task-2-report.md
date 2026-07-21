# Task 2: Employee Appeal Routes — Implementation Report

## Status
✅ **DONE**

## Commit
`4734add` — feat(policy): employee appeal submit + list-own routes (I3: no prompt text by default)

## Implementation Summary

Task 2 adds employee-facing appeal routes to the FastAPI governance service. Employees can submit appeals against automated enforcement decisions and retrieve their own appeals. The implementation enforces I3 privacy: prompt text is NOT stored by default; only stored when the employee explicitly opts in via the `disclosed_text` field.

The implementation consists of:
- **`code/policy/app/routes/appeals.py`** — Two routes: POST create appeal, GET list caller's appeals
- **`code/policy/tests/test_appeals.py`** — Five test cases covering all paths and privacy boundaries
- **`code/policy/app/main.py`** — Router registration

## Execution Log

### Step 1: Write Failing Tests
Created `code/policy/tests/test_appeals.py` with all 5 test cases verbatim from the brief:
1. `test_submit_appeal_without_opt_in_stores_no_prompt_text` — verifies default appeal has no disclosure
2. `test_submit_appeal_with_opt_in_stores_disclosed_text` — verifies opt-in text is stored
3. `test_unknown_pseudo_id_is_401` — 401 on unknown enrolment
4. `test_smuggled_prompt_field_is_422_and_not_echoed` — rejects extra fields; no echo in response
5. `test_list_returns_only_the_callers_appeals` — GET returns only caller's own appeals

### Step 2: Watch It Fail
```
cd code/policy && .venv\Scripts\python -m pytest tests/test_appeals.py -q
```

**Expected failure received:** 405 Method Not Allowed on POST /v1/appeals
- 4 tests failed on status code assertions
- 1 test passed on GET (route doesn't have POST yet)

### Step 3: Write Implementation
Created `code/policy/app/routes/appeals.py` with:
- `POST /v1/appeals` — creates an appeal, stores `disclosed_text` only if provided
- `GET /v1/appeals` — returns caller's own appeals (excludes `disclosed_text` in response)

Both routes:
- Resolve `pseudo_id` → employee ID + org ID
- 401 HTTPException if unknown enrolment
- Follow patterns from `events.py` and `requests.py`

### Step 4: Register Router
Modified `code/policy/app/main.py`:
- Added import: `from app.routes import appeals as _appeals`
- Added registration: `app.include_router(_appeals.router)`

### Step 5: Verify Tests Pass
```
cd code/policy && .venv\Scripts\python -m pytest tests/test_appeals.py -q
```

**Result:**
```
.....                                                                    [100%]
5 passed, 1 warning in 1.34s
```

All five tests pass:
1. ✅ submit appeal without opt-in stores no prompt text (NULL in DB)
2. ✅ submit appeal with opt-in stores disclosed text (exact value in DB)
3. ✅ unknown pseudo_id returns 401
4. ✅ smuggled prompt field returns 422, not echoed in response
5. ✅ GET returns only caller's own appeals (isolation verified)

### Step 6: Full Regression Test
```
cd code/policy && .venv\Scripts\python -m pytest -q
```

**Final result:**
```
85 passed, 1 warning in 4.18s
```

Expected count: 80 (baseline) + 5 (new) = 85 total tests.
✅ All existing tests remain passing; no regressions introduced.

### Step 7: Commit
```
git add code/policy/app/routes/appeals.py code/policy/app/main.py code/policy/tests/test_appeals.py
git commit -m "feat(policy): employee appeal submit + list-own routes (I3: no prompt text by default)"
```

**Commit SHA:** `4734add`

## Verification Checklist

- ✅ Test file matches brief exactly (5 test cases, TestClient pattern, helper function)
- ✅ Implementation matches brief exactly (POST/GET routes, pseudo_id resolution, I3 privacy)
- ✅ All five tests pass (appeals test suite: 5/5)
- ✅ No regressions (full policy suite: 85/85 pass, 80 baseline + 5 new)
- ✅ Router registered in main.py (alphabetically ordered)
- ✅ Commit uses correct message format (no `Co-Authored-By` trailer per CLAUDE.md §6.1)
- ✅ The critical privacy boundary: default appeal stores NULL for `disclosed_text`; GET never returns it
- ✅ 422 validation error does not echo rejected `prompt` field (error handler strips input)

## Technical Notes

### Design Decisions (From Brief)

#### I3 Privacy Boundary by Construction
1. **Default appeal** — `AppealCreate.disclosed_text` defaults to `None` (Optional field)
2. **Database storage** — INSERT maps `body.reason` → `employee_reason` column; prompt text never created by default
3. **Response scrubbing** — GET query SELECT list excludes `disclosed_text` entirely; response dict omits it
4. **Request validation** — `AppealCreate` sets `extra="forbid"`, FastAPI validation error handler strips `input` from error response body (see `main.py` §31–72)

#### Route Patterns
Both routes follow the established pattern from `events.py` and `requests.py`:
- Resolve `pseudo_id` → `(employee_id, org_id)` in one query
- 401 HTTPException (consistent with other endpoints)
- Insert with timestamp via `now_iso()`
- Commit after write

#### Response Design
- **POST** returns minimal data: `{id, status}` (201)
- **GET** returns list ordered by `created_at DESC` (newest first)
- **GET** excludes `disclosed_text` from SELECT (never sent to client)

### Database Mapping
The model field `reason` maps to the database column `employee_reason`:
```
AppealCreate.reason (max 500 chars) → INSERT decision_appeals(employee_reason)
AppealCreate.disclosed_text (max 4000 chars, optional) → INSERT decision_appeals(disclosed_text)
```

## Concerns
None. The implementation follows the brief precisely, all tests pass, the full suite shows no regressions, and the I3 privacy boundary is enforced by construction (model + query + error handler).

---

## Reproducible Commands

```bash
# Run appeals tests
cd code/policy && .venv\Scripts\python -m pytest tests/test_appeals.py -q

# Run full suite (verify no regressions)
cd code/policy && .venv\Scripts\python -m pytest -q

# Verify commit
git log -1 --oneline
```
