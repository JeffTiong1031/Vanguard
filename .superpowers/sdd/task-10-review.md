# Task 10 Review — approval token

## Verdict

- **Spec compliance:** ✅
- **Task quality:** Approved

## Critical findings

None.

## Important findings

None.

## Minor findings

1. **TTL remains live at the exact expiry instant.** `live()` expires only when `Date.now() > expiresAt`, so a token approved with `ttlMs = 0`, or checked exactly at `expiresAt`, can still match. TTL semantics normally make the token invalid at `Date.now() >= expiresAt`. This is at most a one-timer-tick extension and is not a task blocker, but changing the comparison to `>=` would make the boundary precise.

2. **Two stated properties are only implicit in tests.** The suite covers single-use, mismatch retention, and expiry, but does not call `invalidate()` or re-approve the same hash. The implementation of both is straightforward and correct by inspection, yet explicit tests would protect the edit-invalidation API and the specifically required idempotency property from later regression.

## Summary

The task is spec-compliant and cleanly scoped: it provides a synchronous, hash-only, single-use approval store with TTL and edit invalidation, without premature gate/modal wiring.
