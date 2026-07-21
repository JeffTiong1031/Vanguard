-- Task 6: `vendor_reports` -- the vendor's false-positive/false-negative
-- report store, ISOLATED BY CONSTRUCTION from every tenant-scoped table.
--
-- Source spec: docs/superpowers/plans/2026-07-22-governance-vercel-supabase.md
--   -- "Schema changes vs current SQLite" (the exact column list for this
--      table: "id, kind ENUM('fp','fn'), class, scrubbed_text, reason,
--      include_raw BOOL, extension_version, ts. No company_id, no
--      pseudo_id, no department. RLS on, no tenant policy.")
--   -- "RLS sketch" (the literal `vendor_reports` block: "RLS on, and
--      DELIBERATELY NO policy for authenticated/anon... (no create policy
--      ... here, on purpose -- see Task 6 test that proves a tenant JWT
--      reads nothing)")
--   -- Global Constraint #3 ("`vendor_reports` is vendor-only. RLS enabled,
--      zero policies for authenticated/anon. No tenant dashboard API may
--      read it. No pseudo_id, no company_id, no department on the row.")
--   -- "Permission matrix as executable checks" table: "View vendor_reports
--      | Owner NO | Dept admin NO | Enforced by: no RLS policy exists"
--
-- This is the one table in the whole governance schema that is NOT
-- tenant-scoped, and that is the entire point of it: it is the proof that a
-- vendor false-positive/false-negative report can never be joined back to
-- the company, department, or employee that filed it, no matter what future
-- policy someone writes on any *other* table.
--
-- Contrast with every other table in 0001-0003_*.sql, all of which carry
-- `company_id` (directly or via a department_id -> departments.company_id
-- hop) and a client-facing RLS `select` policy scoped through
-- `is_owner`/`can_admin_department`. Here there is deliberately NO such
-- column and NO such policy -- see the isolation mechanism note below.

-- ---------------------------------------------------------------------------
-- Enumerated type
-- ---------------------------------------------------------------------------

-- vendor_reports.kind: a false positive (something flagged that shouldn't
-- have been) or a false negative (something that should have been flagged
-- but wasn't). Scoped narrowly to this one column/table, same reasoning as
-- every enum in 0003_policy.sql -- widening this table's kind set later
-- can't accidentally widen an unrelated table's CHECK by sharing a type.
create type vendor_report_kind as enum ('fp', 'fn');

-- ---------------------------------------------------------------------------
-- vendor_reports
--
-- Column-by-column mapping to the plan's schema row
-- ("id, kind ENUM('fp','fn'), class, scrubbed_text, reason, include_raw
-- BOOL, extension_version, ts"):
--   id                 -> uuid primary key
--   kind               -> vendor_report_kind (the enum above)
--   class              -> text (the detector class the report concerns,
--                         e.g. 'nric' -- an open string, not an FK, because
--                         this table must never reference any tenant-owned
--                         catalog row; keeping it a plain string avoids even
--                         an accidental FK path back toward tenant data)
--   scrubbed_text      -> text (already-scrubbed per Task 11's dual-consent
--                         scrub -- this migration only builds the column
--                         the Report Route Handler writes into, per the
--                         brief's "Interfaces -- Produces:
--                         service-role write path")
--   reason             -> text (free-form vendor-facing note from whoever
--                         filed it)
--   include_raw        -> boolean (opt-in flag recorded alongside the
--                         report; per Global Constraint #2 the actual raw
--                         value is never carried here regardless of this
--                         flag's value -- Task 11 owns that scrub, this
--                         migration only reserves the column)
--   extension_version  -> text (which build filed the report -- diagnostic
--                         metadata, not identity)
--   ts                 -> timestamptz, defaulted server-side
--
-- Deliberately ABSENT, and this is the entire task: company_id, pseudo_id,
-- department_id/department, employee_id, host, requested_by, or any other
-- column that names or FKs toward a tenant, a membership, or an employee
-- row. `scrubbed_text` and `reason` are free-text, which is exactly why
-- this migration does not accept them unscrubbed from any tenant-facing
-- path -- Task 11's Report Route Handler is the only writer (service-role),
-- and it is responsible for making sure neither field is handed an org name
-- or any other re-identifying string before the insert. That is an
-- application-layer (Task 11) responsibility this migration cannot enforce
-- with a CHECK constraint, so it is not claimed as enforced here.
-- ---------------------------------------------------------------------------

create table vendor_reports (
  id uuid primary key default gen_random_uuid(),
  kind vendor_report_kind not null,
  class text not null,
  scrubbed_text text not null,
  reason text not null,
  include_raw boolean not null default false,
  extension_version text not null,
  ts timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Isolation mechanism -- read this before touching this table again.
--
-- `enable row level security` turns OFF the Postgres default of "any role
-- with a GRANT can read every row." Once enabled, a role gets access to a
-- row ONLY if some `create policy` for that role/command evaluates to true.
-- No policy is created below for `authenticated` or `anon` -- for ANY
-- command (select/insert/update/delete). That is not an oversight and not
-- a "deny-all" policy written to explicitly return false; it is the
-- absence of any policy at all. With RLS enabled and zero policies, every
-- authenticated/anon-role query against this table returns zero rows
-- (select) or is rejected (insert/update/delete) -- the deny is structural,
-- not a rule that could later be loosened by editing one `using (...)`
-- clause. The only way to read or write this table is the service-role
-- key, which bypasses RLS entirely by design (same as every other
-- service-role-only write path in 0001-0003_*.sql) and is held
-- server-side only, used solely by the future Report Route Handler
-- (Task 11).
--
-- Do NOT add a policy here "for admin visibility" or "read-only for
-- owners" -- that is precisely the mistake this table exists to prevent.
-- If a future task wants vendor-aggregated reporting, it goes through a
-- vendor-side tool reading with the service-role key (or a service-role
-- Route Handler that deliberately re-derives an aggregate with no
-- per-tenant join), never a client-facing RLS policy on this table.
-- ---------------------------------------------------------------------------

alter table vendor_reports enable row level security;

-- (no create policy ... here, on purpose -- see tests/vendor_isolation.test.ts,
-- which proves an authenticated owner JWT reads 0 rows after a service-role
-- insert.)
