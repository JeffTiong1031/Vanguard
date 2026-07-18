# Task 13 Report — local salted-hash audit + Ignore-rate-per-class

**Branch:** `slice-1-chat-text-extension`  
**Base HEAD:** `a2866822ac7034d531c84f9325953508ac4d1d34`  
**Commit:** `9ba13c8` — feat(ext): local salted-hash audit and Ignore-rate-per-class (no raw values) (trailer stripped via `commit-tree`)

## Delivered

| File | Action |
|---|---|
| `code/extension/src/audit/audit.ts` | Created |
| `code/extension/tests/audit.test.ts` | Created |

## API

- `recordFindings(findings)` — appends rows with `cls`, salted `fp`, `ignored: false`, timestamp
- `recordIgnore(findings, reason)` — appends rows with `ignored: true` + reason (no raw text)
- `ignoreRateByClass()` — returns `{ [cls]: { flagged, ignored } }` from `vg_audit` storage

Per-install salt stored under `vg_salt`; fingerprint via existing `saltedFingerprint`.

## I3 / U26 review gate

Tests assert `JSON.stringify(store)` never contains raw span text (`Ahmad`, `Apple`). Persisted shape: class + 16-char fp + ignore metadata only.

## Tests

```
npx vitest run tests/audit.test.ts   → 2/2 pass
npx vitest run                       → 86/86 pass
```

## Deviation from brief Step 2

Brief's `ignoreRateByClass` incremented `flagged` on **every** row, yielding `{ flagged: 2, ignored: 1 }` for the bundled test. Fixed: non-ignored rows increment `flagged`; ignored rows increment `ignored` only — matches test intent (ignore rate = ignored / flagged flags).

## Out of scope (honoured)

No changes to `content.ts`, `dist/`, gate, or modal.

## Concerns

1. **Append-only model** — `recordIgnore` adds a second row rather than mutating the original flag row; dedupe-by-fp not implemented (fine for Slice 1 instrument).
2. **Reason text** — user-supplied ignore reason is stored verbatim; not span text but could contain PII if user types it — acceptable for local-only audit per current spec.
3. **Integration** — Task 12 will wire `recordFindings` / `recordIgnore` from content; not done here.

## Fix pass — audit findings

**Commit:** `602d04e42c1381964201dd1cd0df57393d2e8b8b` — `fix(ext): redact ignore reasons and serialize audit storage writes`

- **Supersedes Concern 2 above:** ignore reasons are no longer persisted verbatim.
- `recordIgnore` strips every non-empty `finding.text` substring from the persisted reason.
- Salt initialization now shares one in-flight promise; concurrent callers produce one UUID write.
- Audit appends now run through an in-module promise chain, preventing read-modify-write lost updates.
- `ignoreRateByClass` semantics remain `{ flagged: 1, ignored: 1 }`; `content.ts` and `dist/` were untouched.

Commands and output:

```text
npx vitest run tests/audit.test.ts
Test Files  1 passed (1)
Tests       5 passed (5)

npx vitest run
Test Files  17 passed (17)
Tests       89 passed (89)
```
