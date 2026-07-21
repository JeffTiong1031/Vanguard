# Task 1 Report: `decision_appeals` table and wire models

**Date:** 2026-07-21  
**Branch:** `transparency-redressal`  
**Status:** DONE

---

## Summary

Task 1 implemented the `decision_appeals` table and two Pydantic wire models (`AppealCreate`, `AppealDecision`) for the governance platform's appeals feature. Following TDD discipline: wrote failing tests, implemented, verified all 79 tests pass (74 existing + 5 new). Schema and models exactly match the brief specification. No build issues, all constraints enforced.

---

## Files Modified

| Path | Changes | Purpose |
|------|---------|---------|
| `code/policy/app/models.py` | +22 lines | Added `AppealCreate` and `AppealDecision` Pydantic models with `extra="forbid"` |
| `code/policy/app/db.py` | +15 lines | Added `decision_appeals` table and `ix_appeals_org_status` index to schema |
| `code/policy/tests/test_models.py` | +24 lines | 4 new tests for appeal model validation |
| `code/policy/tests/test_db.py` | +10 lines | 1 new test for table schema structure |

---

## Test Execution

### Step 2: Failing tests (before implementation)

```bash
$ cd code/policy && .venv/Scripts/python -m pytest tests/test_models.py -q
E   ImportError: cannot import name 'AppealCreate' from 'app.models'
======================== 1 error in 0.44s =========================
```

Expected failure: models did not yet exist.

### Step 6a: Model tests (after model implementation)

```bash
$ cd code/policy && .venv/Scripts/python -m pytest tests/test_models.py tests/test_db.py -q
................
======================== 16 passed in 0.23s =========================
```

All tests passed: 4 new appeal tests + 12 existing usage event tests.

### Step 6b: Full policy suite (after schema implementation)

```bash
$ cd code/policy && .venv/Scripts/python -m pytest -q
........................................................................ [ 91%]
.......
======================== 79 passed, 1 warning in 3.67s =========================
```

**Test count:** 74 existing + 5 new = 79 total. All pass.

---

## Implementation Details

### Models (`app/models.py`)

**`AppealCreate`** — Employee contesting an enforcement decision:
- `pseudo_id: str` — Employee reference
- `decision_type: Literal["ethics", "pii"]` — Type of decision being appealed
- `category: str` — Category tag
- `reason: str` — Appeal justification (≤500 chars)
- `disclosed_text: Optional[str]` — Optional raw text disclosure (≤4000 chars, defaults to None)
- Configuration: `extra="forbid"` to prevent field smuggling (I3 enforcement)

**`AppealDecision`** — Admin decision on appeal:
- `decision: Literal["upheld", "overturned"]` — Verdict
- `note: Optional[str]` — Optional admin note (≤500 chars, defaults to None)
- Configuration: `extra="forbid"`

### Schema (`app/db.py`)

**`decision_appeals` table** (11 columns):
- `id TEXT PRIMARY KEY` — Appeal identifier
- `org_id TEXT NOT NULL REFERENCES orgs(id)` — Organization
- `employee_id TEXT NOT NULL REFERENCES employees(id)` — Employee
- `decision_type TEXT NOT NULL CHECK (decision_type IN ('ethics', 'pii'))` — Type constraint
- `category TEXT NOT NULL` — Category tag
- `employee_reason TEXT NOT NULL` — Appeal reason
- `disclosed_text TEXT` — Optional raw text (nullable)
- `status TEXT NOT NULL CHECK (status IN ('pending', 'upheld', 'overturned'))` — Appeal status
- `admin_note TEXT` — Optional admin notes (nullable)
- `created_at TEXT NOT NULL` — Creation timestamp
- `decided_at TEXT` — Decision timestamp (nullable)

**Index:** `ix_appeals_org_status` on `(org_id, status)` for efficient filtering by org and status.

Table placed between `access_requests` and `usage_events` blocks as specified.

### Tests

**Model tests** (4 new in `test_models.py`):
1. `test_appeal_create_defaults_disclosed_text_to_none` — Verifies `disclosed_text` defaults to None
2. `test_appeal_create_rejects_unknown_field` — Verifies `extra="forbid"` blocks `prompt` field
3. `test_appeal_create_rejects_bad_decision_type` — Verifies enum constraint on `decision_type`
4. `test_appeal_decision_only_allows_two_verdicts` — Verifies enum constraint on `decision`

**Schema test** (1 new in `test_db.py`):
- `test_decision_appeals_table_exists_with_expected_columns` — Verifies all 11 columns exist

---

## Verification Against Brief

✅ **All requirements met exactly:**

- [x] Models use `model_config = ConfigDict(extra="forbid")` on both classes
- [x] Column names match specification exactly: id, org_id, employee_id, decision_type, category, employee_reason, disclosed_text, status, admin_note, created_at, decided_at
- [x] Model fields match: pseudo_id, decision_type ("ethics"/"pii" only), category, reason (≤500 chars), disclosed_text (Optional[str], ≤4000 chars, defaults None)
- [x] Table placed between `access_requests` and `usage_events` blocks in schema
- [x] Index added next to existing CREATE INDEX lines
- [x] Tests appended to existing test files (no new test files created)
- [x] Commit message format: no `Co-Authored-By` trailer (git author already correct)
- [x] All 79 tests pass (74 existing + 5 new)
- [x] TDD discipline: failing tests → implementation → passing tests

---

## Deviations from Brief

**None.** Implemented exactly as specified.

---

## Concerns

**None.** 

- All model constraints enforced structurally (extra="forbid", field validators, length limits, literal enums)
- Schema integrity via foreign keys and CHECK constraints
- Nullable `disclosed_text` and `decided_at` columns configured correctly per privacy spec (I3)
- Index design optimizes common query patterns (filter by org + status)
- No breaking changes to existing schema or tests

---

## Commit

```
commit 40d3741ea3422df673f3ff9a78462c0c24ab9381
Author: HongHanTan <jasonthh123@gmail.com>
Date:   Tue Jul 21 16:47:07 2026 +0800

    feat(policy): decision_appeals table and appeal wire models

 code/policy/app/db.py            | 15 +++++++++++++++
 code/policy/app/models.py        | 22 ++++++++++++++++++++++
 code/policy/tests/test_db.py     | 10 ++++++++++
 code/policy/tests/test_models.py | 24 ++++++++++++++++++++++++
 4 files changed, 71 insertions(+)
```

---

## Next Task Readiness

Task 2 will add the `appeals` endpoints to the service (GET appeals, POST decision). This table and these models are the stable foundation for that work.

---

## Post-Implementation: Nullability Test (2026-07-21)

**Gap Found:** The schema test `test_decision_appeals_table_exists_with_expected_columns` only verified the set of column names via `PRAGMA table_info()`, discarding the `notnull` flag. A `NOT NULL` typo on `disclosed_text` would silently pass the existing test, defeating the privacy design constraint that raw prompt text defaults to NULL (I3, spec section 6.5).

**Test Added:** `test_decision_appeals_nullability_matches_the_privacy_design()` — verifies:
- `disclosed_text`, `admin_note`, `decided_at` are nullable (`notnull == 0`)
- `employee_reason`, `decision_type` are NOT nullable (`notnull == 1`)

### Evidence (Three Test Runs)

**Run 1 (original schema — PASS):**
```
$ cd code/policy && .venv/Scripts/python -m pytest tests/test_db.py::test_decision_appeals_nullability_matches_the_privacy_design -v
tests/test_db.py::test_decision_appeals_nullability_matches_the_privacy_design PASSED [100%]
1 passed in 0.07s
```

**Run 2 (disclosed_text made NOT NULL — FAIL):**
```
$ cd code/policy && .venv/Scripts/python -m pytest tests/test_db.py::test_decision_appeals_nullability_matches_the_privacy_design -v
tests/test_db.py::test_decision_appeals_nullability_matches_the_privacy_design FAILED [100%]
> assert cols["disclosed_text"]["notnull"] == 0
E assert 1 == 0
1 failed in 0.12s
```

**Run 3 (schema reverted — PASS):**
```
$ cd code/policy && .venv/Scripts/python -m pytest tests/test_db.py::test_decision_appeals_nullability_matches_the_privacy_design -v
tests/test_db.py::test_decision_appeals_nullability_matches_the_privacy_design PASSED [100%]
1 passed in 0.06s
```

**Confirmation:** `git status` after verification shows only `code/policy/tests/test_db.py` modified; `app/db.py` unchanged.
