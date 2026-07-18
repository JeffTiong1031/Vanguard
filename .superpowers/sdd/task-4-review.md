# Task 4 review — L1 detectors (NRIC/SSM/TIN/email/card)

**Verdict: APPROVED.** Spec-compliant implementation; guardrail holds on all 16 clean cases; no phantom
NRIC checksum; no detector weakened vs the brief. Two Minor quality notes only.

**Diff reviewed:** `bbcc575` → `2788d28` (14 files, 191 insertions)

---

## 1. Spec compliance

✅ **Files & interfaces.** All brief-required source and test files present. `FindingClass`, `Finding`,
`runL1`, and per-detector exports match the brief. `export type { Finding, FindingClass }` re-exported
from `index.ts` (also importable from `types.ts`).

✅ **Detector logic vs brief — no weakening.** Regexes and guards are byte-for-byte with the brief:
`NRIC_RE`, `UNASSIGNED_PB`, `SSM_RE` + `looksNric`, `TIN_RE`, `EMAIL_RE`, `CAND_RE`, Luhn + length
`13–19` skip. No checksum anywhere (U1 honoured).

✅ **SSM ambiguity (doc 03 §2.3).** `201501234567` → month 15 → `SSM`. `890101145555` → month/day in
1–12 / 1–31 → `NRIC_OR_SSM_AMBIGUOUS`. Matches brief and tests.

✅ **NRIC/SSM separation on dashed input.** `890101-14-5555` cannot match `SSM_RE` (`\b(\d{12})\b`
requires 12 bare digits; dashes break the run). `runl1.test.ts` asserts single `NRIC` finding — correct
by grammar, not accidental.

✅ **Card 20-digit concern — resolved.** `card.ts` uses `\b(?:\d[ -]?){13,19}\b` plus
`digits.length > 19 → skip`. On a 20-digit continuous run the trailing `\b` cannot close at 13–19
inside the run; test `'12345678901234567890'` → `[]` matches brief intent. Controller's empirical check
accepted; diff confirms anchoring.

✅ **Negative-case ratio.** Spot-checked counts vs diff: nric 1:5, ssm 2:2, tin 1:2, email 1:2, card
2:3, guardrail 0:16 — all meet brief ≥1:1 per detector.

**Extras (acceptable):** `runl1.test.ts` (orchestration/dedupe), extra NRIC day 00/32 negatives, extra
SSM 11/13-digit negatives, card 19-digit positive + adjusted 20-digit negative (documented in report).

**Gaps:** None blocking. Commit body `Co-authored-by: Cursor` is a controller hygiene item, not code.

---

## 2. Guardrail — all 16 clean cases (Critical gate)

Reasoned each case against every detector regex in the diff:

| Case | NRIC (dashed) | SSM (12 bare) | TIN (IG/SG/OG+digits) | EMAIL (@+TLD) | CARD (13–19 + Luhn) |
|---|---|---|---|---|---|
| `1+1`, `1 + 1 = 2` | — | — | — | — | — |
| `the year 2024`, `chapter 12`, `I need 3 apples`, `100%`, `$4.50` | — | — | — | — | digit runs too short; `$4.50` breaks on `.` not in `[ -]` |
| `page 42 of 100`, `2024-01-01 is a date` | wrong shape / broken digit runs | max 4 consecutive digits | — | — | <13 `(?:\d[ -]?)` groups |
| `call me at 3pm`, `aisle 9`, `-5 degrees` | — | — | — | — | single-digit runs |
| `12345`, `order #7890` | — | 5 / 4 digits | — | — | too short |
| `v1.2.3`, `RM 250` | — | — | — | no `@` | `.` / space breaks card groups |

**Result: no detector can fire on any guardrail string.** Critical gate passes.

---

## 3. `runL1` overlap dedupe

Sort `(start asc, end desc)` then drop when `f.start < lastEnd`. Matches brief Step 6 exactly.

- **Dashed NRIC:** no SSM overlap (see above) — dedupe not required but harmless.
- **16-digit PAN `4111111111111111`:** SSM also does not fire — `\b` after 12th digit fails inside a
  longer bare run (digit–digit is not a word boundary). Test passes via regex isolation, not dedupe; see
  Minor #1.
- **Logic correctness:** For genuine overlaps (e.g. spaced card containing a `\b`-bounded 12-digit
  substring), longer span at same start wins; partial overlaps are dropped — slightly stricter than the
  comment's "fully contained" wording but identical to the brief's code sample.

---

## 4. Findings

### Minor — dedupe integration test does not isolate dedupe

`runl1.test.ts` "dedupes overlapping findings" uses a 16-digit string where `detectSsm` cannot match
due to `\b`, so the test proves CARD-only output but not that dedupe drops a would-be SSM hit. Dedupe
logic itself matches the brief; a spaced or boundary-separated overlap case would make the test
load-bearing.

### Minor — dedupe comment overstates behaviour

Comment says "fully contained"; code drops any overlap (`start < lastEnd`). Matches brief code; comment
only is imprecise.

---

## 5. Task quality

| Dimension | Result |
|---|---|
| Spec compliance | ✅ |
| Guardrail (ADR 0017 §5) | ✅ — no false positives on ordinary numbers |
| Precision posture (ADR 0001) | ✅ — negatives ≥ positives per detector; no broadened patterns |
| Pure functions / types | ✅ |
| **Overall** | **Approved** |

No Critical or Important issues. Safe to merge from a task-scoped gate perspective.
