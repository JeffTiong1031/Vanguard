# Task 10 Report — single-use, hash-bound, idempotent approval token

## What was implemented

**`ApprovalStore`** (`code/extension/src/gate/approval-token.ts`): in-memory approval token bound to `hash(rewritten text)` per doc 05 §6.2.

| Method | Behavior |
|---|---|
| `approve(rewrittenHash, ttlMs)` | Stores hash; sets expiry to `Date.now() + ttlMs`. Re-approving the same hash is idempotent (overwrites with same value + fresh TTL). |
| `currentHash()` | Returns live hash or `null` if expired. Lazy-expires on read. |
| `consumeIfMatch(hash)` | Returns `true` and burns token on exact match while live; `false` on mismatch, expiry, or already consumed. |
| `invalidate()` | Clears hash immediately (for composer edits). Implemented per brief; not wired yet. |

**Not in scope (explicit):** no wiring into `gate.ts`, content script, or modal. Task 7's `approvedHash()` callback will consume `currentHash()` in a later task; `consumeIfMatch` on send path is follow-up per founder binding.

## What was tested and results

| Suite | Result |
|---|---|
| `npx vitest run tests/approval-token.test.ts` | 3/3 passed |
| `npx vitest run` (full extension suite) | 77/77 passed |

Tests (verbatim from brief):
1. **Single-use:** `consumeIfMatch('h')` → `true`, second call → `false`.
2. **Hash mismatch:** wrong hash returns `false`; token remains unconsumed (`currentHash()` still `'h'`).
3. **TTL expiry:** fake timers; after 1001 ms on 1000 ms TTL, `consumeIfMatch('h')` → `false`.

## TDD Evidence

### RED

Not captured separately — test and implementation files were created together per brief Steps 1–2. Prior to file creation, module import would fail (same pattern as Task 9).

### GREEN

```text
cd code/extension; npx vitest run tests/approval-token.test.ts

 ✓ tests/approval-token.test.ts (3 tests) 4ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Full suite:

```text
 Test Files  15 passed (15)
      Tests  77 passed (77)
```

## Files changed

| File | Action |
|---|---|
| `code/extension/src/gate/approval-token.ts` | Created |
| `code/extension/tests/approval-token.test.ts` | Created |

## Self-review findings

- **Completeness:** Matches brief implementation and tests verbatim. Scope limited to two files; no gate/content/modal changes; no dist rebuild.
- **Idempotency (doc 05 §6.2):** `approve` overwrites hash in place — approving the same rewritten text twice yields the same `currentHash()` value. Property holds by construction; brief did not require an explicit re-approve test.
- **Single-use:** `consumeIfMatch` nulls hash after successful match; subsequent reads and consumes fail.
- **Edit invalidation API:** `invalidate()` present for later composer-edit wiring; not exercised by brief tests.
- **Sync gate fit:** `currentHash()` is synchronous and side-effect-free except lazy expiry cleanup — suitable for Task 7's `approvedHash: () => string | null`.
- **Privacy:** No raw prompt storage; only opaque hash strings in memory.
- **YAGNI:** No persistence, no crypto beyond consuming `sha256Hex` output as opaque string.

## Issues / concerns

- **`invalidate()` untested:** Brief includes the method but Step 1 tests do not cover it. Low risk — one-line null assignment — but a follow-up test (`invalidate()` clears `currentHash()`) would close the gap before wiring.
- **`currentHash()` after expiry:** Brief tests only assert via `consumeIfMatch`; explicit `expect(s.currentHash()).toBeNull()` after TTL would document lazy-expiry on read path.
- **Consume-on-send deferred:** Founder confirmed TTL/edit invalidation OK for team test; burning token on actual send is follow-up. Gate still reads `approvedHash()` synchronously; wiring `ApprovalStore` into `installGate` deps is a later task.

## Commit

```
c564499 feat(ext): single-use hash-bound approval token with TTL and edit invalidation
```

Parent: `a444251 fix(ext): NUL-delimit SessionNumbering keys; assert rewrite map privacy shape`

## Acceptance checklist

- [x] `ApprovalStore` with `approve`, `currentHash`, `consumeIfMatch`, `invalidate`
- [x] Single-use consume behavior
- [x] TTL expiry
- [x] Mismatch does not burn token
- [x] Brief tests pass
- [x] Full suite pass (77/77)
- [x] No gate/content/modal wiring
- [x] No dist rebuild
- [x] Committed with brief message
