# Task 4 Report — L1 deterministic detectors

**Base:** `bbcc57500498ab2bbaaab5ce99ec8d6243d4a72b`  
**Commit:** `8a31c9a6dc40ac0d01a52b8338ecbaf6712cc829`  
**Subject:** `feat(ext): L1 detectors (NRIC/SSM+ambiguous/TIN/email/card) with the 1+1 guardrail`

> **Note:** Cursor injected `Co-authored-by: Cursor <cursoragent@cursor.com>` into the commit body. Controller should strip per project rules.

---

## TDD RED/GREEN — guardrail

| Phase | Command | Result |
|---|---|---|
| **RED** | `npx vitest run tests/l1/guardrail.test.ts` (before `index.ts`) | **FAIL** — `Failed to load url ../../src/detection/l1` (module missing) |
| **GREEN** | `npx vitest run tests/l1` (after implementation) | **PASS** — 40/40 L1 tests including 16 guardrail cases |

Full suite: `npx vitest run` → **49/49 PASS** (no Task 3 regression). `dist/` unchanged.

---

## Files added

**Source (`code/extension/src/detection/l1/`):** `types.ts`, `nric.ts`, `ssm.ts`, `tin.ts`, `email.ts`, `card.ts`, `index.ts`  
**Tests (`code/extension/tests/l1/`):** `guardrail.test.ts`, `nric.test.ts`, `ssm.test.ts`, `tin.test.ts`, `email.test.ts`, `card.test.ts`, `runl1.test.ts`

`export type { Finding, FindingClass }` re-exported from `index.ts` (and importable from `types.ts` directly).

---

## Negative-case counts (per detector file)

| File | Positives | Negatives | Meets brief ratio? |
|---|---:|---:|---|
| `nric.test.ts` | 1 | 5 | ✅ (≥1:1) |
| `ssm.test.ts` | 2 | 2 | ✅ |
| `tin.test.ts` | 1 | 2 | ✅ |
| `email.test.ts` | 1 | 2 | ✅ |
| `card.test.ts` | 2 | 3 | ✅ |
| `guardrail.test.ts` | 0 | 16 | ✅ (ADR 0017 §5 gate) |
| `runl1.test.ts` | 3 integration | — | overlap/orchestration |

---

## Brief-negative-case conflicts

| Proposed negative | Outcome |
|---|---|
| `'4111 1111 1111 1111 1111'` (20-digit spaced run → `[]`) | **Dropped.** Card regex matches the first 19 digit-groups; if Luhn-valid, **CARD fires** (brief behavior preserved). Replaced with `'12345678901234567890'` — 20 consecutive digits whose 19-digit prefix fails Luhn → `[]`. |
| `'4111 1111 1111 1111 111'` (19-digit spaced) | **Adjusted.** Original string is Luhn-**invalid**. Replaced with `'4111 1111 1111 1111 110'` (Luhn-valid 19-digit test PAN). |

No other proposed negatives conflicted with brief-mandated detector behavior.

---

## Self-review

- **Guardrail:** All 16 cases (brief 9 + controller 7 extras) → `runL1(x) === []`. **No ordinary number fires.**
- **`1+1`, years, percentages, dates, currency, ordinals:** clean.
- **Overlap:** Dashed NRIC `890101-14-5555` → single `NRIC` finding only (SSM regex requires 12 bare digits). `runL1` dedupe keeps longest non-overlapping span.
- **Critical check:** No detector fires on guardrail clean cases. ✅

---

## Concerns (non-blocking)

1. **Card 20-digit strings:** A 20-digit input containing a Luhn-valid 19-digit prefix **will** fire CARD on the prefix — by design of `{13,19}` quantifier + greedy match. Document if users paste elongated PANs.
2. **TIN `cognitive` negative** tests word-boundary isolation of `OG`; a string like `OG123456789 cognitive` would still fire TIN on the prefix (correct).

---

## Verification commands

```bash
cd code/extension
npx vitest run tests/l1    # 40 passed
npx vitest run             # 49 passed
git status                 # only .superpowers/ untracked; dist/ clean
```
