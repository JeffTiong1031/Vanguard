# Task 13 Review

**Spec: ❌**

**Quality: Needs changes.** Exact finding text is now removed from ignore reasons, and the implementation is small, readable, and tested for same-module concurrency. The salt and append locks, however, are module-local and therefore do not serialize the shared `chrome.storage.local` state across tabs or extension contexts.

## Findings

1. **Important — the salt is still not once-per-install across extension contexts.** `saltInitialization` coordinates callers only within one loaded module. On a fresh install, two content-script realms can both read no `vg_salt`, generate different UUIDs, fingerprint with different salts, and race their writes; the last salt persisted becomes canonical. The new test exercises two calls in one realm and cannot detect this production race. Give salt creation one extension-wide owner, such as the service worker/offscreen context.

2. **Important — audit writes are still lossy across extension contexts.** `appendChain` also exists once per module realm, while `vg_audit` is shared across every tab. Two tabs can each perform the same read/modify/write sequence concurrently and overwrite one another. The overlap test proves only same-realm serialization. Route all audit mutation through one extension-wide owner/queue, then test that boundary.

## Summary

Ignore-reason redaction is fixed, but module-local locks do not meet the once-per-install salt or serialized-write requirements across tabs.


## Controller adjudication (2026-07-18)
Critical (reason redaction): FIXED — accepted.
Important (cross-tab salt/append): ACCEPTED AS RESIDUAL for final whole-branch review.
Reason: Task 13 brief and plan sketch place audit in the content world with chrome.storage.local; routing all writes through the service worker is an architectural expansion beyond this task. Module-local serialization covers same-context races. Team-test usage is typically one tab per surface.
Task quality for SDD gate: Approved with residual.
