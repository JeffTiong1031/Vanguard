# ADR 0036 — Report vendor store + L1-randomize default (and appeals L1-scrub)

**Status:** Accepted · **Date:** 2026-07-22 · **Decider:** the founder
**Related:** decision #5 · I1 · I3 · [ADR 0026](0026-report-false-detection-after-slice-2.md) ·
[ADR 0034](0034-port-governance-to-vercel-supabase.md) ·
plan `docs/superpowers/plans/2026-07-22-governance-vercel-supabase.md` Pushback 3

## Context

ADR 0026 already decided that a **Report** control (false-positive from the Send-review modal,
false-negative "report a miss" from the popup) may, with explicit consent, donate a flagged span and
a reason to a vendor-side improvement loop — distinct from Accept and from Ignore, which stays a
local/admin-console compliance signal and never a training label. ADR 0026 specified the *policy*
(opt-in, admin-gated, default payload = span + reason, not live retrain) but not the *storage
boundary* or the *default scrub*, because Report had not yet been built.

The v2 platform also needs a home for it that survives the same audit this package applies to every
other store: I1 (raw prompt text never leaves the device by default) and I3 (automatic
paths carry class + count + salted hash, never values) both bear on where a Report row lands and what
it contains.

Separately, the ethics-appeal flow (`decision_appeals.disclosed_text`, existing, opt-in) writes into
the **company** database, not a vendor store — a different consumer with a different need. That path
was designed before this port and needs an explicit default now that it is being re-implemented on
Supabase.

**A residual worth naming plainly:** the false-negative "report a miss" path exists *because*
detection missed something. A scrub that only touches confirmed L1 hits protects nothing L1 didn't
already catch — so by construction, the text a user pastes into an FN report may contain a real
identifier the randomizer cannot see. No scrub rule closes this; only the user, shown the exact
outgoing text before consenting, is the last line on their own pasted content.

## Decision

**1. `vendor_reports` is identity-free by schema, not just by convention.** No `company_id`,
`pseudo_id`, or `department` column exists on the table, and the Zod schema for `POST /api/v1/report`
rejects any of those fields with a 422 (`.strict()`) — the isolation is enforced before the row is
ever written, not only by access control after. Row-Level Security is enabled on the table with
**zero** policies for `authenticated`/`anon`, so no tenant dashboard query can read it under any
role; only the service-role key, used solely by the Report handler, can write it.

**2. Default scrub = structure-preserving L1 randomize; real digits only via a second, default-OFF
consent.** Every L1 identifier hit is replaced with a same-grammar random value (NRIC-shaped digits →
different NRIC-shaped digits, etc.) before the payload leaves the device. A second checkbox,
unchecked by default, includes the real identifier numbers — never bundled with the first consent, so
there is no single "yes" that silently sends raw values. L2 PERSON/ORG spans are **not** auto-masked
(unchanged from ADR 0026 and the Slice 1 masking policy) — Report's whole value to the improvement
loop is seeing real error shapes in context.

**3. The FN preview is a required UI element, not optional polish.** Because the scrub is bounded by
L1 recall and the FN path is defined by an L1 miss, the modal must show the user the **exact text
that will be sent**, post-scrub, before they consent. This is the actual safeguard on the residual —
not a claim that the scrub is complete.

**4. Ethics-appeal `disclosed_text` is always L1-scrubbed on write to the company DB, with no
real-digits opt-out.** This is a deliberate departure from Report's dual-consent shape, because the
consumer differs: an admin adjudicating an ethics appeal needs the L2 context (register, wording,
who/what was said) to judge intent, not the real NRIC/SSM/TIN digits, which add company-DB liability
for zero review value. `scrubL1(text, {includeRaw:false})` runs unconditionally before
`disclosed_text` is persisted; there is no checkbox that bypasses it. L2 is still not auto-masked —
this only changes what happens to confirmed L1 hits.

## Rejected

| Option | Why not |
|---|---|
| Store `pseudo_id`/`company_id` on `vendor_reports` "for context" | Directly contradicts I1/I3 and the whole reason Report is a separate store from tenant events |
| RLS policy granting tenant read access to `vendor_reports` | Would let an admin dashboard reconstruct who reported what — the isolation must be structural, not a promise never to query it |
| Single consent box covering both scrubbed-and-raw | ADR 0026 already rules out "silent raw under one consent box"; ⁠this ADR extends that rule to the real-digits checkbox specifically |
| Auto-masking L2 on Report or on appeals | Locked product decision (Q1/Q7) — L2 masking stays a per-feature choice, not blanket policy, because Report/appeals need real context to be useful |
| Dual-consent (Report-style) on ethics appeals | Wrong consumer model — the admin reviewing an appeal has no legitimate need for real digits the way the vendor improvement loop does for Report; adds liability with no offsetting value |

## Consequences

- **No support workflow can say "here's what your staff reported"** — that is the correct privacy
  posture (it is *why* the store is identity-free) but a stated support/debugging gap, not a bug to
  fix later.
- **`/api/v1/report` is reachable with no enrollment** (Personal mode always allows Report per Q7) and
  is therefore spammable — there is no per-tenant identity to rate-limit against. Abuse controls
  (per-IP throttling, size caps, CAPTCHA) are explicitly **not built** in this pass; stated as a
  demo-vs-production gap, to be hardened before any public release.
- **Appeals and Report now scrub on two different defaults for a stated reason** — an implementer
  must not "harmonize" them into one behavior without re-deriving which consumer each path serves.
- Extends ADR 0026 rather than superseding it: Report ≠ Ignore ≠ Accept stands; Report is not a
  suppress-list; full-prompt inclusion (when it exists) remains a separate, explicit, off-by-default
  control.
- Revisit if: the FN preview requirement proves to create too much friction in practice (unmeasured —
  no usage data yet, flagged `(unverified)`) — the fallback is not a weaker scrub but a clearer/faster
  preview UI, since the preview is the safeguard, not an obstacle to remove.
