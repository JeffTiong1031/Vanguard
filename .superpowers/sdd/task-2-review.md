# Task 2 review — `dist/`-matches-`src/` drift check

**Base:** `0158ce4847bd9971011042881de9d81a071e48be`  
**Head:** `2b2e49e9d64c42f3f94d4dc0fe8e8bf55a9d1e9c`  
**Brief:** `.superpowers/sdd/task-2-brief.md`  
**Artifact:** `.superpowers/sdd/task-2-review-package.diff`

---

## 1. Spec compliance — ✅ (with gaps)

| Requirement | Verdict | Notes |
|---|---|---|
| Create `scripts/check-dist-drift.mjs` | ✅ | Stub replaced with full checker |
| Create `tests/dist-drift.test.ts` | ✅ | Verbatim from brief |
| Create `vitest.config.ts` | ✅ | Minimal include config |
| `check:dist` exits non-zero on stale `dist/` | ✅ | Logic present; manual drift proof in report is credible |
| `--write` postbuild no-op | ✅ | Early exit 0 unchanged |
| TDD: failing test before implementation | ⚠️ gap | Task 1 stub exits 0 → brief test **PASS** before Task 2 work (false green). Real RED only after full impl hit `spawnSync npx ENOENT` on Windows |
| Scope: scaffold-adjacent only | ✅ | No gate/modal/offscreen/detection changes |
| OSS only | ✅ | Node stdlib + existing WXT dep |
| Commit files match brief Step 5 | ✅ | 3 files, no `dist/` delta |

**Documented deviations (acceptable):**

- **`--outDir` CLI absent (WXT 0.19.29):** Brief flagged `[verify]`; temp `.wxt-drift.config.mjs` + `--config` is a valid fallback.
- **`execFileSync('npx', …)` → `process.execPath` + `wxt.mjs`:** Required for Windows; correct fix.

**Extras (non-blocking):** `try/finally` config cleanup, inline comment on WXT flag absence.

---

## 2. Task quality — **Changes requested**

### Important — test does not verify drift detection

The sole test asserts `execFileSync(…check-dist-drift.mjs…)` **does not throw**. That proves only the **in-sync happy path**:

- A Task 1-style stub (`process.exit(0)`) **passes** — confirmed in report.
- Any implementation that always exits 0 **passes**, even if it never rebuilds or compares.
- The test **can** fail if the checker exits non-zero while `dist/` is actually in sync (false positive) or crashes, but it **cannot** fail when the checker **silently accepts stale `dist/`**.

The comment in the test (*"exits 0 when in sync, 1 when stale"*) describes behaviour the test never exercises. **Regression to a no-op stub would not be caught by CI running `vitest run` alone.**

Manual drift proof (`appendFileSync` → exit 1) validates the script; the automated test does not.

**Suggested fix:** add a second case that mutates a committed artifact (or points `COMMITTED` at a fixture), runs the checker, and expects non-zero exit / thrown `execFileSync` error; restore in `afterEach`.

### Important — TDD RED phase was not meaningful

Global constraint requires a failing test before implementation. With Task 1's stub in place, Step 2 of the brief would **PASS**, not FAIL. Implementer documented this honestly; it does not satisfy the spirit of TDD even though the brief's test shape is to blame.

Not Critical — implementation was verified manually and post-impl RED (ENOENT) did occur — but the gate should not treat Step 2 as evidence of RED.

### Important — drift build config duplicates `wxt.config.ts` manifest

`.wxt-drift.config.mjs` inlines the full manifest instead of extending `wxt.config.ts`. Values match today, but any future change to `wxt.config.ts` alone will either (a) cause false drift failures, or (b) if someone updates only the drift config, compare builds produced from divergent configs. Prefer extending the canonical config and overriding `outDir` only.

### Minor — ephemeral config orphan risk

If the process is killed between `writeFileSync` and `finally`, `.wxt-drift.config.mjs` may remain in cwd. Low probability; gitignore or write under `tmpdir()` would be cleaner.

### Minor — no guard if `dist/chrome-mv3` or temp output missing

`hashTree` / `readdirSync` will throw rather than exit 1 with a actionable message. Acceptable for scaffold; note for later hardening.

---

## 3. Implementation assessment (well-built?)

**Core checker:** Sound. SHA-256 manifest over relative paths, symmetric key union, drift list on mismatch, exit 1 + stderr message match the brief. Temp outDir avoids clobbering committed `dist/`. Windows spawn fix is the right call.

**WXT workaround:** Reasonable given verified CLI limitation. `[verify]` resolved correctly.

**What is not well-built:** test coverage for the property ADR 0017 §3 actually cares about (detecting staleness), and config duplication that will rot.

---

## 4. Verdicts

| Gate | Result |
|---|---|
| **Spec compliance** | ✅ — deliverables and drift exit behaviour match brief; TDD process gap noted |
| **Task quality** | **Changes requested** — add drift-negative test; extend canonical WXT config |

No **Critical** issues. Implementation is functionally correct; quality gate fails on one-sided test coverage that cannot catch the guard's primary failure mode.
