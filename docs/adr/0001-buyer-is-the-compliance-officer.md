# ADR 0001 — The buyer is the compliance officer, not the user

**Status:** Accepted (2026-07-16) · **Deciders:** founder + CTO · **Supersedes:** the "Grammarly for
prompt privacy" consumer framing in the original brief

## Context

The product's core action is refusal: it stops the user doing what they were trying to do. The
original brief's UX (inline underlines, hover tooltips, friendly Ignore, "minimal added friction")
was designed for a user who wants the tool. We had to decide who actually pays.

## Options

1. **Individual prosumer** — self-serve, freemium, user is the buyer.
2. **Enterprise compliance officer** — seat-licensed, admin-set policy, top-down.
3. **PLG: prosumer → enterprise** — land with individuals, expand to teams.
4. **Regulated vertical** — narrow beachhead, statutory teeth.

## Decision

**Option 2 — enterprise compliance officer.**

The individual pays the entire cost of the tool (friction, false positives, broken flow) while the
benefit — a leak that didn't happen — is invisible and accrues to their employer. That is an
externality, and externalities are corrected by the party that internalizes them. The compliance
officer's arithmetic is inverted: the leak is *their* career risk, the friction is someone else's
inconvenience, and they hold a budget line for it.

Retention is the tiebreak. Consumer has no floor — every false positive is a reason to uninstall and
nobody stops you. Enterprise has force-install, a renewal conversation, and a buyer who *wants* the
friction, because the friction is the product.

Option 3 rejected: it builds two products whose requirements actively oppose each other (the free
tier must not block; the paid tier must). Option 4 deferred, not rejected — it's a plausible
narrowing of Option 2 if the horizontal sale stalls.

## Consequences

**Accepted:**
- Policy lives in a tenant console. The user gets **no** disable-detection toggle.
- Audit trail becomes a first-class feature, not telemetry — it's half of what's being bought.
- Uninstall is a security event that must page someone.
- The precision target becomes quasi-contractual: every false positive is a ticket **the admin** eats.
- Two surfaces to build: the daily-active user and the demo audience are different people with
  opposed interests.
- **The best product decisions will make users unhappier.** This must be accepted, not sanded down.

**Costs:**
- Longer sales cycle; no self-serve revenue to bootstrap on.
- Entire enterprise control story depends on force-install (assumption **B3**, currently Low
  confidence, zero primary research).

**Revisit if:** primary research (doc 08's #1 pre-Phase-0 item) shows the target segment will not
deploy a force-installed extension. That would not send us back to Option 1 — it would question the
form factor (ADR 0002).
