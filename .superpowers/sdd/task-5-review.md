# Task 5 review — hash + synchronous verdict cache

**Verdict: APPROVED.** Spec-compliant; all five verification gates pass. One Minor quality note only.

**Diff reviewed:** `2788d28` → `93c26b4` (3 files, 56 insertions)

---

## 1. Spec compliance

✅ **Scope.** Commit range touches exactly the three brief files: `hash.ts`, `verdict-cache.ts`,
`verdict-cache.test.ts`. No dist or unrelated churn.

✅ **`getSync` synchronous.** Returns `Verdict | undefined` directly from `Map.get`; no Promise, no
async. Matches decision #8 gate contract.

✅ **Monotonic toward dirty (ADR 0013).** `setClean` early-returns when `this.m.get(hash)?.state ===
'DIRTY'`. Test `setClean does not overwrite an existing DIRTY` asserts state stays `DIRTY` after
`setClean` — load-bearing and passes.

✅ **Cold cache.** `getSync('nope')` on empty cache returns `undefined`; test proves it. Caller-treats-
as-unknown contract documented in test name.

✅ **`saltedFingerprint`.** `sha256Hex` via `crypto.subtle.digest('SHA-256', …)`; `saltedFingerprint`
hashes `salt + '\0' + text`, slices to 16 hex chars (64-bit prefix). Test asserts `/^[0-9a-f]{16}$/`
and different salts → different fingerprints for same text. One-way hash + salt satisfies I3 audit
shape (not reversible to raw text).

✅ **Interfaces vs brief Step 2.** `sha256Hex`, `saltedFingerprint`, `Verdict`, `VerdictCache` with
`getSync` / `setDirty` / `setClean` / `markComplete` match the brief’s implementation block verbatim.
`Finding` imported from `./l1/types`; test fixture matches `Finding` type.

✅ **Extras (acceptable).** Third cache test (`setClean on a cold hash sets CLEAN with complete:true`)
and `saltedFingerprint` describe block go beyond brief Step 1 but stay in scope and strengthen ADR 0013 /
I3 coverage.

**Gaps:** None blocking. Commit `Co-authored-by: Cursor` is controller hygiene, not code.

---

## 2. Verification checklist (requested gates)

| # | Check | Result |
|---|---|---|
| 1 | `getSync` synchronous, no Promise | ✅ |
| 2 | `setClean` no-op on existing DIRTY; test proves | ✅ |
| 3 | Cold `getSync` → `undefined` | ✅ |
| 4 | `saltedFingerprint` salt + SHA-256, 16-char hex; salting test | ✅ |
| 5 | No extra files beyond hash + cache + tests | ✅ |

---

## 3. Findings

### Minor — `markComplete` untested

Present in brief Step 2 but no test covers it (including the edge case where it sets `complete: true`
on a DIRTY entry). Acceptable for this task — implementer notes future L1→L2 wiring — but Task 6+
should test gate/cache integration before relying on `complete` alone.

---

## 4. Task quality

| Dimension | Result |
|---|---|
| Spec compliance | ✅ |
| ADR 0013 monotonic rule | ✅ |
| Decision #8 sync read | ✅ |
| I3 fingerprint shape | ✅ |
| Scope discipline | ✅ |
| **Overall** | **Approved** |

No Critical or Important issues. Safe to merge from a task-scoped gate perspective.
