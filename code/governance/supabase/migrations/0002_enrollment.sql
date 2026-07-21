-- Task 4: one-person one-time enroll tokens + revocable employees, with the
-- employees.enroll_token_id link the original SQLite schema lacked.
--
-- Source spec: docs/superpowers/plans/2026-07-22-governance-vercel-supabase.md
--   -- "Schema changes vs current SQLite" (the `enroll_tokens` / `employees` rows)
--   -- "RLS sketch" (the `employees_read` / `employees_revoke` example policies)
--   -- "The matrix (Q8)" ("Mint/revoke enroll tokens" row: owner any dept, dept
--      admin own dept only, enforced by requireScope(dept_admin) + RLS)
--
-- Departs from the old code/policy/app/db.py SQLite shape in exactly the ways
-- the plan calls out: `org_id` -> `company_id`; the bare `department TEXT`
-- string column on both tables -> a real `department_id` FK; enroll_tokens
-- gains `max_uses`, `consumed_at`, `consumed_employee_id`, `created_by`;
-- employees gains `enroll_token_id`, `status`, `last_seen_at`. `employees`
-- still has **no name/email column** -- that omission was deliberate in the
-- old schema (see db.py's own comment on it) and stays deliberate here.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- `enroll_tokens` and `employees` reference each other (a token records which
-- employee consumed it; an employee records which token it was created from),
-- so one of the two FKs has to be added after both tables exist. Order below:
-- create `enroll_tokens` with `consumed_employee_id` as a bare uuid column
-- (no FK yet) -> create `employees` with its `enroll_token_id` FK against the
-- now-existing `enroll_tokens` -> `alter table` on to add the deferred FK.

create table enroll_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  department_id uuid not null references departments (id) on delete cascade,
  token_hash text not null unique,
  label text not null,
  -- One-person, one-time for this task. `max_uses` is a column (not a bare
  -- boolean) because the plan's schema literally calls for
  -- `max_uses INT DEFAULT 1` -- kept as a column so a later multi-use token
  -- design (if ever wanted) is a constraint change, not a new column -- but
  -- the CHECK below pins it to exactly 1 for now so nothing downstream can
  -- silently widen the one-person guarantee by inserting a row with, say,
  -- max_uses=5 before the app-layer logic exists to honour anything else.
  max_uses integer not null default 1,
  consumed_at timestamptz,
  -- Deferred FK to employees(id), added below once that table exists.
  consumed_employee_id uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  revoked boolean not null default false,
  constraint enroll_tokens_max_uses_one_person check (max_uses = 1),
  -- Schema-level half of "cannot be consumed twice": consumed_at and
  -- consumed_employee_id are set together or not at all. This doesn't by
  -- itself stop a double-consume race (that's the conditional
  -- `where consumed_at is null` update Task 8's route handler performs, and
  -- rls_enrollment.test.ts below exercises that same conditional-update
  -- pattern directly against the table) -- it does stop a consumed token
  -- from ever being *recorded* half-consumed, e.g. an employee link with no
  -- timestamp attached, or a timestamp with no linked employee.
  constraint enroll_tokens_consumed_together check (
    (consumed_at is null and consumed_employee_id is null)
    or (consumed_at is not null and consumed_employee_id is not null)
  )
);

create index enroll_tokens_company_department_idx
  on enroll_tokens (company_id, department_id);

create type employee_status as enum ('active', 'revoked');

create table employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  department_id uuid not null references departments (id) on delete cascade,
  pseudo_id text not null unique,
  -- Nullable, not "the missing link made mandatory": a later demo-migration
  -- task (docs/superpowers/plans/2026-07-22-governance-vercel-supabase.md's
  -- cutover step) explicitly ports legacy SQLite employees with
  -- `enroll_token_id=null` because the old shared-per-department tokens have
  -- no one-person row to point at. `on delete set null` (not `restrict`) so
  -- deleting a stale token row (never done by the app today, but not
  -- forbidden by this migration) can't be blocked by an employee's
  -- historical link to it.
  enroll_token_id uuid references enroll_tokens (id) on delete set null,
  status employee_status not null default 'active',
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index employees_company_department_idx
  on employees (company_id, department_id);
create index employees_enroll_token_idx on employees (enroll_token_id);

-- Deferred FK: an enroll_token's consumed_employee_id points at the employee
-- it minted. `on delete set null`, matching consumed_employee_id's own
-- nullability above and employees.enroll_token_id's choice just above it --
-- losing the employee row shouldn't take the token's audit trail with it.
alter table enroll_tokens
  add constraint enroll_tokens_consumed_employee_fk
  foreign key (consumed_employee_id) references employees (id)
  on delete set null;

create index enroll_tokens_consumed_employee_idx
  on enroll_tokens (consumed_employee_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Both tables reuse `can_admin_department(company_id, department_id)` from
-- 0001_core.sql (owner anywhere in the company, or a dept_admin scoped to
-- that exact department) -- no duplicated ad-hoc membership logic here, same
-- as 0001_core.sql's own departments_* policies and the plan's
-- `employees_read` / `employees_revoke` example.
--
-- Every policy is scoped `to authenticated` explicitly, for the same reason
-- 0001_core.sql's comment gives: can_admin_department has EXECUTE revoked
-- from `public`, so an un-scoped policy would let an `anon` query reach the
-- function and get a permission error instead of a clean 0-row deny.
-- ---------------------------------------------------------------------------

alter table enroll_tokens enable row level security;
alter table employees enable row level security;

-- enroll_tokens: per the matrix, "Mint/revoke enroll tokens" is owner (any
-- dept) or dept_admin (own dept only), enforced by
-- requireScope(dept_admin, departmentId) **+ RLS** -- i.e. this table's
-- writes ARE meant to go through the signed-in user's own JWT from the
-- dashboard (unlike employees' insert, which Task 8's /api/v1/enroll route
-- performs with the service-role client and therefore never needs a policy
-- here -- see the employees section below).
create policy enroll_tokens_read on enroll_tokens for select to authenticated using (
  can_admin_department(company_id, department_id)
);

create policy enroll_tokens_insert on enroll_tokens for insert to authenticated with check (
  can_admin_department(company_id, department_id)
);

-- Covers both "revoke an unused token" (`revoked=true`) and the mint-time
-- server recording a consume (dashboard flows don't consume tokens -- that's
-- the extension's service-role-guarded /api/v1/enroll route -- but the same
-- generic update policy is what a dept_admin's revoke action runs through).
create policy enroll_tokens_update on enroll_tokens for update to authenticated using (
  can_admin_department(company_id, department_id)
) with check (
  can_admin_department(company_id, department_id)
);

-- employees: read + revoke only. There is deliberately no insert or delete
-- policy -- per the plan, employees are never created through a dashboard
-- write subject to RLS; they're minted by Task 8's /api/v1/enroll route
-- handler using the service-role client (which bypasses RLS entirely, same
-- as companies/memberships insert in 0001_core.sql). RLS-enabled + no
-- insert/delete policy for `authenticated` = both denied by default.
create policy employees_read on employees for select to authenticated using (
  can_admin_department(company_id, department_id)
);

-- "Revoke" here is a plain update policy (matching the plan's own
-- `employees_revoke` example verbatim) rather than a policy that inspects
-- which column changed -- Postgres RLS `with check` can't easily express
-- "only the status column may change" without a trigger, and the plan's own
-- sketch doesn't attempt it. Scoping is company/department, same as read.
create policy employees_update on employees for update to authenticated using (
  can_admin_department(company_id, department_id)
) with check (
  can_admin_department(company_id, department_id)
);
