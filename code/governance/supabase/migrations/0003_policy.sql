-- Task 5: tools lifecycle (registry, company/department policy, requests),
-- ethics/PII categories, org/dept settings, usage events, appeals.
--
-- Source spec: docs/superpowers/plans/2026-07-22-governance-vercel-supabase.md
--   -- "Schema changes vs current SQLite" (table shapes for every table below)
--   -- "RLS sketch" (`is_owner`/`can_admin_department` -- reused from
--      0001_core.sql, NOT redefined here)
--   -- "The matrix (Q8)" (which writes get a client-facing RLS policy vs. are
--      Layer-2-only / service-role-guarded -- see the per-table RLS comments)
--   -- Global Constraint #10 ("Unknown tool default = blocked... Owner deny
--      wins. Depts may tighten only") -- shapes `company_llm_policy.status` +
--      `owner_banned` and `department_llm_policy.status`; this migration
--      builds the *columns* the merge algorithm (Task 9/12) will read, not
--      the merge algorithm itself.
--
-- Ported from code/policy/app/db.py + app/seed.py (the old SQLite service):
-- `orgs`->`companies` (0001), `org_llm_policy`->`company_llm_policy`,
-- `policy_category`->`company_policy_category`, `access_requests`->
-- `tool_requests`, `usage_events` and `decision_appeals` carried forward with
-- the additions the plan's schema table calls for. `admin_sessions` is
-- dropped (Supabase Auth owns sessions) and not reproduced anywhere.

-- ---------------------------------------------------------------------------
-- Enumerated status/scope types
--
-- Each is scoped narrowly to the one column it names (rather than reusing,
-- say, a single generic "status" enum across tables) so that widening one
-- table's state machine later (e.g. adding a `department_llm_policy` state)
-- can't accidentally widen another table's CHECK by sharing the same type.
-- ---------------------------------------------------------------------------

-- company_llm_policy.status: the three-state company-wide lifecycle (Q9).
-- 'pending' exists here (not on department_llm_policy) because a company-wide
-- request can be awaiting an owner decision; a department can only ever
-- tighten to 'blocked' or accept the company default as 'approved' -- it has
-- no pending state of its own (Global Constraint #10: depts tighten only).
create type llm_policy_status as enum ('blocked', 'pending', 'approved');

-- department_llm_policy.status: two-state, tightening-only (see above).
create type dept_llm_policy_status as enum ('blocked', 'approved');

create type tool_request_scope as enum ('department', 'company');
create type tool_request_status as enum ('pending', 'approved', 'denied');

-- decision_appeals.decision_type: which gate the appealed decision came from.
create type appeal_decision_type as enum ('ethics', 'pii');
create type appeal_status as enum ('pending', 'upheld', 'overturned');

-- ---------------------------------------------------------------------------
-- llm_registry -- global catalog, NOT company-scoped
--
-- Unchanged from the SQLite shape per the plan's schema table ("Unchanged
-- (global catalog, seeded)"). `id` stays a short text slug (not a uuid) to
-- match app/seed.py's REGISTRY tuples and because it is a human-curated,
-- rarely-changing list (8 rows) referenced by id in every other table below
-- -- a slug is legible in ad-hoc SQL and in the dashboard's URL/query params
-- in a way a uuid isn't, and there is no per-tenant variant of this table to
-- collide with.
-- ---------------------------------------------------------------------------

create table llm_registry (
  id text primary key,
  host text not null unique,
  display_name text not null
);

insert into llm_registry (id, host, display_name) values
  ('openai',     'chatgpt.com',           'ChatGPT'),
  ('anthropic',  'claude.ai',             'Claude'),
  ('google',     'gemini.google.com',     'Google Gemini'),
  ('microsoft',  'copilot.microsoft.com', 'Microsoft Copilot'),
  ('perplexity', 'www.perplexity.ai',     'Perplexity'),
  ('deepseek',   'chat.deepseek.com',     'DeepSeek'),
  ('mistral',    'chat.mistral.ai',       'Le Chat (Mistral)'),
  ('xai',        'grok.com',              'Grok')
on conflict (id) do nothing;

-- RLS: this is a read-only catalog, not tenant data -- there is no
-- company_id/department_id column to scope by, and nothing sensitive in a
-- host+display_name pair (both are already public knowledge -- they're the
-- literal domains of ChatGPT/Claude/etc.). Enabled with a permissive select
-- policy for every authenticated user, per the task's own suggested default;
-- flagged in the task report as a judgment call rather than picked silently.
-- No insert/update/delete policy: only this migration (as the table owner,
-- outside RLS) and a future service-role admin script should ever write it.
alter table llm_registry enable row level security;

create policy llm_registry_read on llm_registry for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- company_llm_policy (was org_llm_policy)
-- ---------------------------------------------------------------------------

create table company_llm_policy (
  company_id uuid not null references companies (id) on delete cascade,
  llm_id text not null references llm_registry (id),
  status llm_policy_status not null default 'blocked',
  -- Global Constraint #10 / Q8: "owner deny wins" -- a department may never
  -- loosen a tool the owner has banned. This is the column the (not-yet-
  -- built) merge algorithm reads; Task 9/12 write the logic, this task only
  -- builds the column, per the brief.
  owner_banned boolean not null default false,
  primary key (company_id, llm_id)
);

create index company_llm_policy_company_idx on company_llm_policy (company_id);

alter table company_llm_policy enable row level security;

-- Read: any member of the company (owner or any dept_admin), not just
-- can_admin_department, because a dept dashboard needs to see the COMPANY's
-- policy (including owner_banned) to merge it against its own department
-- policy -- the same "any member reads" shape as companies_read in
-- 0001_core.sql, for the same reason (no department_id column exists here to
-- call can_admin_department with).
create policy company_llm_policy_read on company_llm_policy for select to authenticated using (
  is_owner(company_id) or exists (
    select 1 from memberships m
    where m.company_id = company_llm_policy.company_id and m.user_id = auth.uid()
  )
);

-- Write: owner-only, and deliberately NOT given a client-facing RLS write
-- policy here. Per the plan's permission matrix, company-wide tool
-- defaults/bans fall under "Org settings ... tool defaults/bans", whose
-- "Enforced by" column reads `requireScope(need:'owner')` with no "+ RLS"
-- suffix -- same shape as 0001_core.sql's companies/memberships inserts:
-- the write goes through a service-role Route Handler (Layer 2), not a
-- client-side RLS-checked write (Layer 1). RLS-enabled + no write policy for
-- `authenticated` = denied by default, matching that established pattern.

-- ---------------------------------------------------------------------------
-- department_llm_policy (new)
-- ---------------------------------------------------------------------------

create table department_llm_policy (
  department_id uuid not null references departments (id) on delete cascade,
  llm_id text not null references llm_registry (id),
  status dept_llm_policy_status not null default 'blocked',
  primary key (department_id, llm_id)
);

alter table department_llm_policy enable row level security;

-- This table has no company_id column (the plan's schema row lists only
-- `department_id, llm_id, status`), so can_admin_department(company_id,
-- department_id) is called via a subquery through `departments` rather than
-- directly -- the same helper, no duplicated membership logic, just one more
-- join than 0001/0002 needed.
--
-- Per the matrix, "Tools: tighten (block)" is explicitly "Enforced by: RLS
-- on department_llm_policy" (unlike company_llm_policy's owner-only,
-- guard-only write above) -- so this table DOES get real client-facing
-- write policies, matching an owner or a dept_admin scoped to that exact
-- department.
create policy department_llm_policy_read on department_llm_policy for select to authenticated using (
  exists (
    select 1 from departments d
    where d.id = department_llm_policy.department_id
      and can_admin_department(d.company_id, d.id)
  )
);

create policy department_llm_policy_insert on department_llm_policy for insert to authenticated with check (
  exists (
    select 1 from departments d
    where d.id = department_llm_policy.department_id
      and can_admin_department(d.company_id, d.id)
  )
);

create policy department_llm_policy_update on department_llm_policy for update to authenticated using (
  exists (
    select 1 from departments d
    where d.id = department_llm_policy.department_id
      and can_admin_department(d.company_id, d.id)
  )
) with check (
  exists (
    select 1 from departments d
    where d.id = department_llm_policy.department_id
      and can_admin_department(d.company_id, d.id)
  )
);

-- Note: RLS enforces WHO may write a row here, not the "never loosen an
-- owner ban" business rule -- that reads company_llm_policy.owner_banned,
-- a cross-table check plain `with check` can't express cleanly. Per the
-- brief, that merge/guard logic is Task 9/12's job; this migration only
-- builds the columns it will read.

-- ---------------------------------------------------------------------------
-- tool_requests (was access_requests)
-- ---------------------------------------------------------------------------

create table tool_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  department_id uuid not null references departments (id) on delete cascade,
  llm_id text not null references llm_registry (id),
  -- Nullable: the plan's schema row literally lists
  -- "requested_pseudo_id NULL". A request can be scope-escalated to
  -- 'company' (an owner-banned tool re-filed into the owner queue, per Q8/Q9)
  -- without necessarily carrying a single requesting employee once it's a
  -- company-wide re-file target of a rule, so this stays optional. Still an
  -- FK against employees.pseudo_id (unique, not the PK, but a plain FK to a
  -- unique column is valid in Postgres) rather than a bare unconstrained
  -- text column, so a typo'd pseudo_id can't silently orphan a request.
  requested_pseudo_id text references employees (pseudo_id) on delete set null,
  reason text not null check (char_length(reason) <= 500),
  scope tool_request_scope not null default 'department',
  status tool_request_status not null default 'pending',
  cooldown_until timestamptz,
  decided_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index tool_requests_company_status_idx on tool_requests (company_id, status);
create index tool_requests_department_idx on tool_requests (department_id);

alter table tool_requests enable row level security;

-- Read only: dept_admin sees their own department's requests, owner sees the
-- whole company's (including any 'company'-scope escalations). Per the
-- matrix, "Tools: approve/deny request" is enforced by "guard +
-- owner_banned check" -- Layer 2 / service-role only, no "+ RLS" -- so
-- deciding a request (status/decided_by/decided_at) goes through a Route
-- Handler, not a client-side RLS write, same reasoning as
-- company_llm_policy's write above. Insert is likewise absent: requests are
-- filed by the extension (no Supabase session -- "Extension endpoints do not
-- use RLS") via a service-role route, matching employees' insert-less
-- pattern in 0002_enrollment.sql.
create policy tool_requests_read on tool_requests for select to authenticated using (
  can_admin_department(company_id, department_id)
);

-- ---------------------------------------------------------------------------
-- company_policy_category (was policy_category)
-- ---------------------------------------------------------------------------

create table company_policy_category (
  company_id uuid not null references companies (id) on delete cascade,
  key text not null,
  label text not null,
  enabled boolean not null default true,
  -- Q8: the owner sets the ethics/PII floor; a department may tighten
  -- (disable further is not applicable to a floor -- see
  -- department_policy_category below) but never loosen a floor category.
  is_floor boolean not null default false,
  primary key (company_id, key)
);

alter table company_policy_category enable row level security;

-- Read: any company member (same "any member reads company-wide policy"
-- shape as company_llm_policy_read above -- a dept dashboard must see the
-- company floor to render/merge it).
create policy company_policy_category_read on company_policy_category for select to authenticated using (
  is_owner(company_id) or exists (
    select 1 from memberships m
    where m.company_id = company_policy_category.company_id and m.user_id = auth.uid()
  )
);

-- Write: owner-only, Layer-2/service-role only -- same "Org settings ...
-- floors" matrix bucket as company_llm_policy, no "+ RLS" suffix, so
-- deliberately no insert/update policy for `authenticated` here either.

-- NOTE on the 6 ethics category keys (covert_surveillance,
-- undisclosed_profiling, discriminatory_screening, security_evasion,
-- harassment_content, regulatory_circumvention -- code/policy/app/seed.py's
-- ETHICS_CATEGORIES): this migration does NOT seed them here, and that is a
-- deliberate reading of the plan's schema table, not an oversight. Unlike
-- llm_registry (a genuinely global, company-less catalog), every row in
-- this table requires a company_id -- there is no company yet for this
-- migration to attach category rows to (companies are created later, by
-- Task 7's `createCompany` Server Action). The plan's schema table also
-- never describes a standalone category-catalog table the way it does for
-- llm_registry; `company_policy_category` IS the catalog, seeded
-- PER COMPANY. Old code/policy/app/seed.py's `seed_demo_org` did exactly
-- this at org-creation time, not at schema-migration time. Flagged in the
-- task report: Task 7 (createCompany) should insert these 6 rows for the
-- new company, mirroring seed_demo_org -- this migration only documents the
-- 6 keys as plain string keys with no separate catalog table.

-- ---------------------------------------------------------------------------
-- department_policy_category (new)
-- ---------------------------------------------------------------------------

create table department_policy_category (
  department_id uuid not null references departments (id) on delete cascade,
  key text not null,
  -- Default true: a row existing in this table represents a department
  -- explicitly turning a category ON (enabling a category the company left
  -- off, per the plan's own wording) -- there is no dept-level "off" state
  -- for a floor category (is_floor lives on company_policy_category; a
  -- floor cannot be loosened, so there is nothing for a dept row to
  -- override toward false). Enforcing "never disable a floor" is a
  -- cross-table check plain CHECK/RLS can't express and is Task 9/12's
  -- guard logic, not this migration's -- same shape as
  -- department_llm_policy's owner_banned note above.
  enabled boolean not null default true,
  primary key (department_id, key)
);

alter table department_policy_category enable row level security;

-- Same subquery-through-departments shape as department_llm_policy (no
-- company_id column here either). Treated as a "tightening" write, the same
-- matrix shape as department_llm_policy ("Dept tightening" in the plan's
-- own "Why" column for this row).
create policy department_policy_category_read on department_policy_category for select to authenticated using (
  exists (
    select 1 from departments d
    where d.id = department_policy_category.department_id
      and can_admin_department(d.company_id, d.id)
  )
);

create policy department_policy_category_insert on department_policy_category for insert to authenticated with check (
  exists (
    select 1 from departments d
    where d.id = department_policy_category.department_id
      and can_admin_department(d.company_id, d.id)
  )
);

create policy department_policy_category_update on department_policy_category for update to authenticated using (
  exists (
    select 1 from departments d
    where d.id = department_policy_category.department_id
      and can_admin_department(d.company_id, d.id)
  )
) with check (
  exists (
    select 1 from departments d
    where d.id = department_policy_category.department_id
      and can_admin_department(d.company_id, d.id)
  )
);

-- ---------------------------------------------------------------------------
-- company_settings (new)
-- ---------------------------------------------------------------------------

create table company_settings (
  company_id uuid primary key references companies (id) on delete cascade,
  -- Global Constraint #8 / plan's Q4/Q7/Q9: exact default per the task's
  -- self-review checklist -- `not null default false`.
  allow_ignore boolean not null default false,
  report_enabled_company boolean not null default false,
  tool_recooldown_hours integer not null default 24 check (tool_recooldown_hours > 0),
  -- FLAGGED JUDGMENT CALL (see task report): the plan's schema row lists
  -- "ethics_floor / pii_floor refs" without spelling out a type or what
  -- they reference. `is_floor` already lives per-category on
  -- company_policy_category, and the 6 ethics categories are the only
  -- category keys this package defines -- there is no equivalent "pii
  -- category" catalog anywhere in the plan or the old schema, so a
  -- same-shape FK for pii_floor isn't derivable. Rather than invent an enum
  -- or a composite FK guess (a company_policy_category FK needs company_id
  -- in the FK too, and would only cover ethics_floor, not pii_floor at
  -- all), these are added as nullable, unconstrained text placeholders.
  -- This is a genuine gap, not a resolved design -- confirm the intended
  -- semantics before Task 9/12 build the floor-merge logic that would read
  -- these columns.
  ethics_floor_key text,
  pii_floor_key text
);

alter table company_settings enable row level security;

-- Read: any company member (owner + all dept_admins need to know
-- allow_ignore / floors / cooldown to render their own dashboard views and
-- respect the floor per the matrix's "Appeals ... respect floor" row).
create policy company_settings_read on company_settings for select to authenticated using (
  is_owner(company_id) or exists (
    select 1 from memberships m
    where m.company_id = company_settings.company_id and m.user_id = auth.uid()
  )
);

-- Write: owner-only, Layer-2/service-role only -- this IS the matrix's "Org
-- settings" row verbatim ("allow_ignore, company Report, floors, tool
-- defaults/bans" -- Owner yes, Dept admin no, requireScope(need:'owner'),
-- no "+ RLS"). Deliberately no insert/update policy for `authenticated`.

-- ---------------------------------------------------------------------------
-- department_settings (new)
-- ---------------------------------------------------------------------------

create table department_settings (
  department_id uuid primary key references departments (id) on delete cascade,
  report_enabled boolean not null default false
);

alter table department_settings enable row level security;

-- Read-only RLS, same reasoning as company_settings: the matrix's "Dept
-- Report toggle" row is "Enforced by: department_settings guard" with no
-- "+ RLS" suffix, i.e. Layer-2/service-role only for the write. Read is
-- scoped the department way (subquery through departments, no company_id
-- column here either).
create policy department_settings_read on department_settings for select to authenticated using (
  exists (
    select 1 from departments d
    where d.id = department_settings.department_id
      and can_admin_department(d.company_id, d.id)
  )
);

-- ---------------------------------------------------------------------------
-- usage_events
--
-- I3, restated as a schema-level guarantee, not just an application-level
-- one: there is no column here that could hold prompt text, and there must
-- never be one. `finding_hash` is a salted-hash reference (per doc 04 /
-- ASSUMPTIONS.md's audit-log invariant in the sibling Vanguard package this
-- repo also documents) -- never the raw value.
-- ---------------------------------------------------------------------------

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  -- New per the plan's schema row ("Add department_id, seconds INT NULL").
  department_id uuid not null references departments (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  host text not null,
  -- Extended type set per the plan's schema row: the five original SQLite
  -- event types plus send_count, focus_tick, ignore. A CHECK constraint
  -- (not an enum) so a later extension of this set is a plain ALTER ...
  -- ADD CONSTRAINT, not a type migration.
  type text not null check (type in (
    'visit_unapproved', 'warn_shown', 'request_sent', 'ethics_block',
    'pii_block', 'send_count', 'focus_tick', 'ignore'
  )),
  category text,
  finding_hash text,
  -- New per the plan's schema row: focus-seconds (Q5). NULL for every event
  -- type except focus_tick.
  seconds integer check (seconds is null or seconds >= 0),
  ts timestamptz not null default now()
);

create index usage_events_company_ts_idx on usage_events (company_id, ts);
create index usage_events_department_ts_idx on usage_events (department_id, ts);

alter table usage_events enable row level security;

-- Read-only RLS, matching the matrix's "Usage / insider-risk analytics"
-- row exactly ("Owner all depts, Dept admin own dept -- Enforced by: RLS").
-- No insert/update/delete policy for `authenticated`: events are written by
-- the extension via a service-role route (no Supabase session held
-- client-side, same as employees/enroll_tokens' service-role-only writes),
-- never by a dashboard user directly.
create policy usage_events_read on usage_events for select to authenticated using (
  can_admin_department(company_id, department_id)
);

-- ---------------------------------------------------------------------------
-- decision_appeals
-- ---------------------------------------------------------------------------

create table decision_appeals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  -- New per the plan's schema row ("Add department_id") -- scopes appeals to
  -- dept dashboards, same reasoning as usage_events above.
  department_id uuid not null references departments (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  decision_type appeal_decision_type not null,
  category text not null,
  employee_reason text not null,
  -- Nullable, opt-in only: an employee may choose to disclose the actual
  -- prompt text to support their appeal, but nothing here ever defaults to
  -- carrying it. Absent unless the employee explicitly supplied it -- never
  -- populated by any automatic event path (contrast with usage_events,
  -- which has no such column at all, ever).
  disclosed_text text,
  status appeal_status not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  -- One-time pass: an overturned ethics appeal carries a hash of the prompt
  -- so the extension can grant a single pass on that exact prompt.
  prompt_hash text,
  pass_used boolean not null default false
);

create index decision_appeals_company_status_idx on decision_appeals (company_id, status);
create index decision_appeals_department_status_idx on decision_appeals (department_id, status);

alter table decision_appeals enable row level security;

-- Per the matrix, "Appeals: view + decide" is "Owner all, Dept admin own
-- dept (respect floor) -- Enforced by: RLS + floor check" -- unlike the
-- Layer-2-only rows above, this one explicitly includes RLS for the
-- decide/write side too, so (unlike tool_requests/company_settings/
-- department_settings above) this table DOES get an update policy here.
-- "Respect floor" -- a dept_admin should not be able to overturn an appeal
-- against a company floor category -- is a cross-table check this
-- migration does not attempt (same "columns now, guard logic in Task
-- 9/12/12b" split as owner_banned and the category floor above); RLS here
-- only enforces the department-scoping half of that row.
create policy decision_appeals_read on decision_appeals for select to authenticated using (
  can_admin_department(company_id, department_id)
);

create policy decision_appeals_update on decision_appeals for update to authenticated using (
  can_admin_department(company_id, department_id)
) with check (
  can_admin_department(company_id, department_id)
);

-- No insert policy: appeals are filed by the extension via a service-role
-- route (no Supabase session held client-side), same reasoning as
-- tool_requests/usage_events above.
