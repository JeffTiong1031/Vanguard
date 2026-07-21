import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { clientAsUser, serviceTestClient } from "./rls-helpers";

/**
 * Task 3 TDD test for the `departments_read` RLS policy
 * (`can_admin_department(company_id, id)` in
 * supabase/migrations/0001_core.sql), against a real local Supabase stack.
 *
 * Setup: seeds two companies and one department each via the service-role
 * client (bypasses RLS), creates a real `auth.users` row (the FK
 * `memberships.user_id -> auth.users(id)` requires one -- this is not
 * faked), and inserts a `memberships` row scoping that user as
 * `dept_admin` of company A / department X only. All assertions then run
 * through `clientAsUser`, i.e. an anon-key client carrying that user's own
 * (hand-signed, see rls-helpers.ts) JWT -- the one path actually subject
 * to RLS.
 *
 * Brief scenario (task-governance-3-brief.md step 1): "with two seeded
 * companies + a dept_admin JWT scoped to company A dept X, assert the
 * admin can select A/X departments and cannot select company B
 * departments."
 *
 * Execution note: this needs `supabase start` (Docker) to run for real.
 * Not executed in the environment this was written in -- see
 * task-governance-3-report.md for the self-review that stands in for
 * RED/GREEN here.
 */

interface CompanyRow {
  id: string;
  name: string;
}

interface DepartmentRow {
  id: string;
  company_id: string;
  name: string;
}

function requireRow<T>(
  rows: T[] | null | undefined,
  predicate: (row: T) => boolean,
  what: string,
): T {
  const row = rows?.find(predicate);
  if (!row) {
    throw new Error(`rls_core.test.ts setup: could not find seeded ${what}`);
  }
  return row;
}

describe("departments RLS: is_owner / can_admin_department", () => {
  const svc = serviceTestClient();

  // Suffix each name with a fresh UUID (not just `Date.now()`) so the two
  // names can never collide even if both inserts land in the same
  // millisecond -- a collision here would make `requireRow` (an
  // `Array.find`) resolve both companyA and companyB to the same row,
  // silently turning the cross-tenant "cannot select company B" assertion
  // into a same-tenant comparison that passes without exercising RLS at all.
  const companyAName = `RLS Test Co A ${Date.now()}-${randomUUID()}`;
  const companyBName = `RLS Test Co B ${Date.now()}-${randomUUID()}`;

  let companyA: string;
  let companyB: string;
  let deptX: string; // company A's department
  let deptY: string; // company B's department
  let deptAdminUserId: string;

  beforeAll(async () => {
    // --- seed two companies, service-role bypasses RLS entirely ---
    const { data: companies, error: companiesErr } = await svc
      .from("companies")
      .insert([{ name: companyAName }, { name: companyBName }])
      .select("id, name");
    if (companiesErr) throw companiesErr;

    companyA = requireRow(
      companies as CompanyRow[] | null,
      (c) => c.name === companyAName,
      "company A",
    ).id;
    companyB = requireRow(
      companies as CompanyRow[] | null,
      (c) => c.name === companyBName,
      "company B",
    ).id;

    // --- one department per company ---
    const { data: depts, error: deptsErr } = await svc
      .from("departments")
      .insert([
        { company_id: companyA, name: "Dept X" },
        { company_id: companyB, name: "Dept Y" },
      ])
      .select("id, company_id, name");
    if (deptsErr) throw deptsErr;

    deptX = requireRow(
      depts as DepartmentRow[] | null,
      (d) => d.company_id === companyA,
      "department X (company A)",
    ).id;
    deptY = requireRow(
      depts as DepartmentRow[] | null,
      (d) => d.company_id === companyB,
      "department Y (company B)",
    ).id;

    // --- a real auth user for the dept_admin (FK requires a real row) ---
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email: `rls-test-dept-admin-${Date.now()}-${randomUUID()}@example.test`,
      password: "correct-horse-battery-staple-1!",
      email_confirm: true,
    });
    if (createErr) throw createErr;
    if (!created.user) {
      throw new Error("rls_core.test.ts setup: admin.createUser returned no user");
    }
    deptAdminUserId = created.user.id;

    // --- scope that user to company A / department X only ---
    const { error: memErr } = await svc.from("memberships").insert({
      company_id: companyA,
      user_id: deptAdminUserId,
      role: "dept_admin",
      department_id: deptX,
    });
    if (memErr) throw memErr;
  });

  afterAll(async () => {
    // Cascades (on delete cascade) remove the seeded departments and the
    // membership row along with their companies.
    await svc.from("companies").delete().in("id", [companyA, companyB]);
    if (deptAdminUserId) {
      await svc.auth.admin.deleteUser(deptAdminUserId);
    }
  });

  test("dept_admin can select their own scoped department (company A / dept X)", async () => {
    const asDeptAdmin = clientAsUser(deptAdminUserId);

    const { data, error } = await asDeptAdmin
      .from("departments")
      .select("id, company_id, name")
      .eq("id", deptX);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(deptX);
    expect(data?.[0]?.company_id).toBe(companyA);
  });

  test("dept_admin cannot select company B's department by id", async () => {
    const asDeptAdmin = clientAsUser(deptAdminUserId);

    // RLS hides a denied row silently -- Postgres RLS never errors a
    // SELECT for a row a policy excludes, it just omits it. Asserting only
    // `error` would also pass a broken policy that returns everything;
    // the empty-array assertion is the actual test.
    const { data, error } = await asDeptAdmin
      .from("departments")
      .select("id, company_id, name")
      .eq("id", deptY);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  test("dept_admin's unfiltered department scan never includes company B", async () => {
    const asDeptAdmin = clientAsUser(deptAdminUserId);

    const { data, error } = await asDeptAdmin
      .from("departments")
      .select("id, company_id");

    expect(error).toBeNull();
    expect(data?.some((d) => d.company_id === companyB)).toBe(false);
    expect(data?.every((d) => d.company_id === companyA)).toBe(true);
  });
});
