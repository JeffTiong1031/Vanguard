-- Task 3: core tenancy schema (companies, departments, memberships) + the two
-- RLS helper functions every later table's policy calls.
--
-- Source spec: docs/superpowers/plans/2026-07-22-governance-vercel-supabase.md
--   -- "Schema changes vs current SQLite" (table shapes)
--   -- "RLS sketch" (helper function bodies, representative policy shape)
--
-- Scope note: only SELECT policies are added for `companies` and
-- `memberships` in this migration. `companies` rows are created at signup
-- time (before any membership row exists to grant "owner" status -- a
-- chicken-and-egg problem an authenticated INSERT policy can't resolve) and
-- `memberships` rows are created by "Invite dept admins", both of which the
-- plan's permission matrix marks as `requireScope(need:'owner')` ONLY, with
-- no "+ RLS" suffix (unlike "Dept CRUD", which the matrix marks
-- "Enforced by: requireScope(need:'owner') + RLS"). Read that matrix as: those
-- two writes go through a service-role Route Handler (Layer 2), not a
-- client-side RLS-checked write (Layer 1). `departments` DOES get full
-- owner-only write policies below because the matrix explicitly says so.
-- RLS is enabled on all three tables regardless, so until a later task adds
-- more policies, any write path not listed below is denied by default for
-- the `authenticated` role (the same "RLS on, zero policies -> denied"
-- posture the plan uses for `vendor_reports`).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  policy_version integer not null default 1,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create index departments_company_idx on departments (company_id);

create type membership_role as enum ('owner', 'dept_admin');

create table memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role membership_role not null,
  department_id uuid references departments (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Owner: department_id NULL (company-wide scope). Dept admin: exactly one
  -- row per scoped department. Per the plan's `memberships` row.
  constraint memberships_department_scope check (
    (role = 'owner' and department_id is null)
    or (role = 'dept_admin' and department_id is not null)
  )
);

create index memberships_company_user_idx on memberships (company_id, user_id);
create index memberships_department_idx on memberships (department_id);

-- ---------------------------------------------------------------------------
-- RLS helper functions
--
-- `security definer`: both functions read `memberships`, and `memberships`
-- has its own RLS policy below (`memberships_read`) that calls `is_owner`.
-- Without `security definer`, the SELECT inside `is_owner`'s body would
-- itself be subject to `memberships_read` -- which calls `is_owner` again --
-- and Postgres raises "infinite recursion detected in policy for relation
-- memberships". `security definer` runs the function body as its owner,
-- bypassing RLS for that inner query only.
--
-- This is safe despite the RLS bypass: every query inside these functions
-- filters on `m.user_id = auth.uid()`, i.e. the calling user's own
-- membership rows only. A security-definer function that ran an
-- unconstrained query would be a privilege-escalation bug; this one never
-- reads another user's row.
-- ---------------------------------------------------------------------------

create function is_owner(c uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
    where m.company_id = c and m.user_id = auth.uid() and m.role = 'owner');
$$;

create function can_admin_department(c uuid, d uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_owner(c) or exists (select 1 from memberships m
    where m.company_id = c and m.user_id = auth.uid()
      and m.role = 'dept_admin' and m.department_id = d);
$$;

revoke execute on function is_owner (uuid) from public;
revoke execute on function can_admin_department (uuid, uuid) from public;
grant execute on function is_owner (uuid) to authenticated;
grant execute on function can_admin_department (uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table companies enable row level security;
alter table departments enable row level security;
alter table memberships enable row level security;

-- Every policy below is scoped `to authenticated` deliberately, not left to
-- default to all roles (which in Postgres/PostgREST includes `anon`).
-- is_owner/can_admin_department have EXECUTE revoked from `public` (above),
-- so an `anon`-role query that triggered one of these policies would raise
-- a permission error instead of the clean "0 rows" a logged-out dashboard
-- request should get. Scoping `to authenticated` means an anon query never
-- reaches a policy that calls these functions at all: RLS-enabled + no
-- applicable policy for `anon` = denied outright, no function call, no error.

-- companies: owner sees their own company; a dept_admin sees the company
-- they're scoped into (any department). There's no "is any kind of member"
-- helper (only is_owner/can_admin_department, which need a department id),
-- so the dept_admin half is a direct membership-existence check rather than
-- a helper call -- there is no ad-hoc *duplication* of is_owner's or
-- can_admin_department's own logic here, just a broader existence check
-- neither helper expresses.
create policy companies_read on companies for select to authenticated using (
  is_owner(id) or exists (
    select 1 from memberships m
    where m.company_id = companies.id and m.user_id = auth.uid()
  )
);

-- departments: owner sees every department in their company; dept_admin
-- sees only the department(s) they're scoped to. This is the policy
-- rls_core.test.ts exercises directly.
create policy departments_read on departments for select to authenticated using (
  can_admin_department(company_id, id)
);

-- Dept CRUD is owner-only per the plan's permission matrix ("Dept CRUD:
-- Owner yes, Dept admin no, Enforced by requireScope(need:'owner') + RLS").
create policy departments_insert on departments for insert to authenticated with check (
  is_owner(company_id)
);

create policy departments_update on departments for update to authenticated using (
  is_owner(company_id)
) with check (
  is_owner(company_id)
);

create policy departments_delete on departments for delete to authenticated using (
  is_owner(company_id)
);

-- memberships: a user can always read their own membership row(s); an
-- owner can read every membership row in their company (needed for an
-- admin "who has access" dashboard view). Insert/update/delete (inviting
-- or revoking a dept admin) is deliberately NOT given a policy here -- see
-- the scope note at the top of this file -- and is a later task's
-- service-role-guarded Route Handler.
create policy memberships_read on memberships for select to authenticated using (
  user_id = auth.uid() or is_owner(company_id)
);
