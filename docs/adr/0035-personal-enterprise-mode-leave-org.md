# ADR 0035 — Personal/Enterprise binary + Leave-org

**Status:** Accepted · **Date:** 2026-07-22 · **Decider:** the founder
**Related:** decision #2 · decision #8 · [ADR 0013](0013-two-stage-verdict.md) ·
[ADR 0014](0014-degrade-to-advisory-never-closed.md) ·
[ADR 0034](0034-port-governance-to-vercel-supabase.md) ·
plan `docs/superpowers/plans/2026-07-22-governance-vercel-supabase.md` Pushbacks 1–2

## Context

The extension today has no mode concept: it is either enrolled in an org (via a pasted token) or not,
and enforcement everywhere is advisory. The v2 platform introduces a hard requirement — an
Enterprise-mode device that is **not enrolled** must not send to covered AI surfaces at all, and a
**revoked** employee must stop working close to immediately.

This creates a real tension with an existing, load-bearing decision. **ADR 0014** established that a
dead detection engine degrades to advisory and never fail-closed, because a hard block on ChatGPT in
the browser relocates the leak to the ChatGPT desktop app — a channel with no audit trail. If the new
enrollment gate is implemented as "just another case that reaches the same block," it silently
re-opens the exact failure ADR 0014 closed.

Live revoke has its own tension with **decision #2 + #8**: the Send gate must decide synchronously
(`stopImmediatePropagation()` cannot be awaited), so a revoke check cannot be a network round-trip
made at Send time without reintroducing the stop-and-replay decision #8 forbids.

## Decision

**Two distinct blocked-states, kept apart in code, not merged into one path.**

- **Engine-dead / scan-timeout** (ADR 0014's three triggers: dead engine, broken adapter,
  unresolvable surface) → **advisory**, unchanged. Send proceeds; the user and admin are told
  protection is degraded.
- **Enrollment-gate** (`gateReason: 'not_enrolled' | 'revoked'`) → **hard Send lock.** This is not a
  detection verdict that can fail open onto an unaudited channel — it is a configuration state the
  user chose (Enterprise mode) or is in (revoked), with exactly two documented exits: enroll, or
  Leave organization. There is no third "send anyway," so there is no silent fail-open to relocate.
  ADR 0014's argument does not transfer here because its premise — a verdict that might be wrong or
  stale — does not apply to a state the system and the user both know is true.

**Local mode is an explicit state machine**, not an implicit default: `mode: 'personal' | 'enterprise'`
plus `enroll: none | {company_id, department_id, pseudo_id, token_fingerprint}`. Fresh install shows
a first-run picker. Personal ↔ Enterprise is free while `enroll === none`. Once enrolled, Enterprise
→ Personal is **only** reachable via an explicit, destructive-confirm **Leave organization** action —
there is no silent toggle back. A revoked employee stays in Enterprise (blocked) until they either
receive a new token or explicitly Leave.

**Live revoke reuses the existing gate pattern: the poll is the cache.** The ≤60s policy poll writes
`enrollment.status` into `chrome.storage.local`; the Send gate reads that cached status
*synchronously* and blocks if `revoked`. Send also fires a best-effort, non-awaited refresh that can
only **tighten** the cache (active → revoked takes effect on the *next* Send), reusing ADR 0013's
monotonic-toward-dirty rule. "Immediate on next Send" means the next Send **after** the poll that
observed the revoke, not sub-poll — worst case ~60s idle. If a revoke races a Send, at most one Send
may still use the pre-revoke cache; the refresh is fire-and-forget and is never awaited (decision
#2/#8 leave no other option).

## Rejected

| Option | Why not |
|---|---|
| Route the enrollment gate through ADR 0014's advisory/timeout path | Conflates "detector might be wrong" with "user chose this state"; would silently re-open the exact fail-open ADR 0014 closed |
| Await a revoke re-check inside the synchronous Send gate | Reintroduces stop-and-replay, which decision #8 forbids |
| Free toggle Enterprise → Personal at any time while enrolled | Lets a device silently exit governance with no record; Leave-org's destructive confirm is the intended friction |
| Sub-poll (real-time push) revoke | No push channel exists in this build; would require infrastructure (e.g. WebSocket/SSE) not scoped here — flagged as a possible future tightening, not built |

## Consequences

- Two modal variants in the extension, never collapsed into one: an advisory banner (Send proceeds)
  and a hard-lock modal (Send stops, escape = enroll/Leave). Implementers must not route
  `not_enrolled`/`revoked` through the engine-timeout code path.
- **Revoke-latency is honestly bounded, not instantaneous:** ≤~60s idle in the common case; up to one
  extra Send may complete on stale cache if it races a fresh revoke. This is stated plainly in the
  plan and in any sales/compliance conversation — do not claim zero-latency or sub-poll revocation.
- B3 (force-install) is not built here, but local state is shaped so a later policy flag can hide the
  Personal option and disable Leave-org without a further architecture change — noted as future scope,
  not implemented.
- Revisit if: a design partner's security review demands sub-poll revocation — that would require a
  push channel (WebSocket/SSE) into the service worker, which is new infrastructure and a new ADR, not
  a parameter change to this one.
