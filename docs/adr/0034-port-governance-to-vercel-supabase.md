# ADR 0034 — Port governance to Vercel + Supabase; depart from the demo token model

**Status:** Accepted · **Date:** 2026-07-22 · **Decider:** the founder
**Related:** decision #5 · I1 · I3 · [ADR 0007](0007-python-backend-with-codegen.md) ·
[ADR 0009](0009-org-dictionary-key-custody.md) ·
[ADR 0014](0014-degrade-to-advisory-never-closed.md) ·
[ADR 0026](0026-report-false-detection-after-slice-2.md) ·
plan `docs/superpowers/plans/2026-07-22-governance-vercel-supabase.md`

## Context

`code/policy/` is a **pitch demo**: FastAPI + a single in-process SQLite connection + a Preact SPA.
Two properties of that demo are load-bearing defects, not incidental ones:

- **Enroll tokens are per-department and shared.** One token spawns N pseudonymous employees; the
  department is bound to the token (not self-reported), which is correct, but the token is never
  bound to a *person*.
- **Revoke only blocks future enrollment.** `enroll_tokens.revoked=1` stops the next paste; there is
  no `employees` ↔ `enroll_tokens` link, so an already-enrolled employee keeps polling and working
  indefinitely (`code/policy/app/routes/admin.py:145`, documented in the Tokens admin screen and the
  README). This is a live gap, not a design choice — the admin UI tells the operator so.

Separately, the demo's privacy controls are FastAPI-specific and do not travel automatically to any
other stack: `extra="forbid"` on 7 Pydantic models (I3 — automatic events cannot smuggle prompt
text), and a custom 422 handler (`app/main.py:31`) that strips Pydantic's `input`/`ctx` from
validation-error responses so a rejected body never echoes the raw value back to the caller.

The founder is building a v2 governance platform with materially more surface (Personal/Enterprise
mode, live revoke, company + department dashboards, a real permission matrix, a vendor-isolated
Report store) and wants one backend surface for the extension rather than a growing FastAPI plus a
second host. `code/backend/` (file extract/redact, ADR 0007) is a separate, zero-retention service
and is explicitly out of scope for this decision — its defining property (`tests/test_zero_retention.py`)
must not be compromised by adding a governance database anywhere near it.

## Options

1. **Full replace** — retire FastAPI; rebuild the governance domain as Next.js Route Handlers on
   Vercel, backed by Supabase Postgres + RLS + Auth. One extension-facing surface.
2. **Strangler** — Vercel serves the dashboard + new endpoints; unmigrated routes proxy to a rehosted
   FastAPI (SQLite → Postgres) during a route-by-route migration.
3. **Keep FastAPI long-term** — Vercel hosts the dashboard only; the extension keeps talking to a
   rehosted FastAPI permanently.

## Decision

**Option 1 — full replace.** Founder decision, 2026-07-22.

Option 2 keeps two runtimes and a proxy hop live for weeks — exactly the seam the extension has to
trust, for a migration with no external users yet to protect. Option 3 permanently contradicts the
goal of one backend surface and leaves the FastAPI-specific privacy controls (§ above) as a second
thing to keep correct forever. Given there is no production traffic to migrate incrementally, the
full replace has no live-migration risk to offset against its larger up-front rewrite.

**Token model changes with the platform, not incidentally:** enroll tokens become **one-person,
one-time** (`enroll_tokens.max_uses=1`, `consumed_at`, `consumed_employee_id`), and `employees` gains
`enroll_token_id` — the FK that the SQLite schema never had. Revoking a **person** (not just an unused
token) sets `employees.status='revoked'`, and the policy-poll ETag folds in that status so revocation
propagates within one poll cycle (≤~60s) instead of never (see ADR 0035 for the latency honesty).

**The FastAPI privacy controls do not port for free.** `extra="forbid"` becomes Zod `.strict()`; the
422 `input`-stripping handler becomes a shared `validationResponse()` formatter that omits the
rejected value from every error path. Both are re-implemented and TDD'd (plan Task 2) — they are not
inherited by switching frameworks, and the plan requires a passing test that no rejected-body value
ever appears in a 422 response before either lands.

## Rejected

| Option | Why not |
|---|---|
| Strangler (proxy to FastAPI) | Two runtimes + a proxy hop live for weeks, no live traffic to justify the incremental-migration cost |
| Keep FastAPI long-term | Permanently two backend surfaces; contradicts "one surface for the extension" |
| Merge governance tables into `code/backend/` | Rejected outright, not reconsidered here — breaks `code/backend`'s zero-retention property (design spec §3.1) |

## Consequences

- **RLS is the tenant boundary**, not application-level filtering alone — every governance table is
  company-scoped from day one (plan §"Schema changes").
- **The extension's API surface moves once**, to Vercel Route Handlers using a server-only
  service-role Supabase key; scoping (token→company, pseudo_id→employee) is enforced in handler code
  and covered by tests, since the extension holds no Supabase session and RLS cannot apply to it.
- **`code/policy/` is retired to reference-only** (`DEPRECATED.md`), not deleted — kept for migration
  reference. It is never deployed after cutover.
- **The old demo's shared tokens are not carried forward as usable** — they have no one-person
  semantics to preserve. The migration script marks them deprecated rather than attempting a
  live conversion (plan Task 15).
- **`code/backend/` is untouched.** No governance table, route, or dependency lands there; this is a
  standing constraint on every task in the plan, not a one-time check.
- Revisit if: Supabase Postgres/RLS proves to be a poor fit under real load (unmeasured — no
  comparable deployment to cite; flagged `(unverified)` in the plan) — the service-role-bypasses-RLS
  design (rather than a pure per-request RLS design for the extension too) is the largest blast-radius
  choice here and is the first thing to reexamine if a scoping bug ever surfaces in production.
