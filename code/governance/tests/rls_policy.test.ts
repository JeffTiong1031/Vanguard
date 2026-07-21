import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { clientAsUser, serviceTestClient } from "./rls-helpers";

/**
 * Task 5 TDD test for supabase/migrations/0003_policy.sql: the
 * usage_events / company_settings / company_llm_policy / department_llm_policy
 * schema and the RLS policies that reuse `can_admin_department` from
 * 0001_core.sql.
 *
 * Per task-governance-5-brief.md step 1, the three required scenarios are:
 *   1. a `usage_events` insert with an unknown column fails.
 *   2. a dept_admin reads only own-department `usage_events`.
 *   3. `company_settings.allow_ignore` defaults to `false`.
 *
 * A few more cases are added beyond the brief's three, directly answering
 * this task's own self-review checklist rather than leaving those items as
 * unverified eyeballing: `company_llm_policy.owner_banned` really defaults
 * to `false`, the `(company_id, llm_id)` composite PK really rejects a
 * duplicate, and `department_llm_policy`'s "tighten own department only"
 * RLS write policy really denies a sibling department (mirroring
 * rls_enrollment.test.ts's same-company cross-department shape).
 *
 * Execution note: needs `supabase start` (Docker) to run for real. Not
 * executed in the environment this was written in -- see
 * task-governance-5-report.md for the self-review that stands in for
 * RED/GREEN here, same limitation as Tasks 3 and 4.
 */

interface CompanyRow {
  id: string;
}

interface DepartmentRow {
  id: string;
  name: string;
}

function requireRow<T>(
  rows: T[] | null | undefined,
  predicate: (row: T) => boolean,
  what: string,
): T {
  const row = rows?.find(predicate);
  if (!row) {
    throw new Error(`rls_policy.test.ts setup: could not find seeded ${what}`);
  }
  return row;
}

describe("policy schema (0003_policy.sql)", () => {
  const svc = serviceTestClient();

  // Fresh UUID suffix per name, same collision-avoidance reasoning as
  // rls_core.test.ts / rls_enrollment.test.ts.
  const companyName = `RLS Policy Test Co ${Date.now()}-${randomUUID()}`;
  const deptXName = `Policy Dept X ${randomUUID()}`;
  const deptYName = `Policy Dept Y ${randomUUID()}`;

  let companyId: string;
  let deptX: string; // the dept_admin's own department
  let deptY: string; // a sibling department, same company
  let deptAdminUserId: string;
  let employeeInX: string;
  let employeeInY: string;

  beforeAll(async () => {
    const { data: company, error: companyErr } = await svc
      .from("companies")
      .insert({ name: companyName })
      .select("id")
      .single();
    if (companyErr) throw companyErr;
    if (!company) throw new Error("rls_policy.test.ts setup: no company row returned");
    companyId = (company as CompanyRow).id;

    const { data: depts, error: deptsErr } = await svc
      .from("departments")
      .insert([
        { company_id: companyId, name: deptXName },
        { company_id: companyId, name: deptYName },
      ])
      .select("id, name");
    if (deptsErr) throw deptsErr;
    deptX = requireRow(depts as DepartmentRow[] | null, (d) => d.name === deptXName, "department X").id;
    deptY = requireRow(depts as DepartmentRow[] | null, (d) => d.name === deptYName, "department Y").id;

    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email: `rls-policy-dept-admin-${Date.now()}-${randomUUID()}@example.test`,
      password: "correct-horse-battery-staple-1!",
      email_confirm: true,
    });
    if (createErr) throw createErr;
    if (!created.user) {
      throw new Error("rls_policy.test.ts setup: admin.createUser returned no user");
    }
    deptAdminUserId = created.user.id;

    const { error: memErr } = await svc.from("memberships").insert({
      company_id: companyId,
      user_id: deptAdminUserId,
      role: "dept_admin",
      department_id: deptX,
    });
    if (memErr) throw memErr;

    const { data: employees, error: employeesErr } = await svc
      .from("employees")
      .insert([
        { company_id: companyId, department_id: deptX, pseudo_id: `pseudo-policy-x-${randomUUID()}` },
        { company_id: companyId, department_id: deptY, pseudo_id: `pseudo-policy-y-${randomUUID()}` },
      ])
      .select("id, department_id");
    if (employeesErr) throw employeesErr;
    employeeInX = requireRow(
      employees as { id: string; department_id: string }[] | null,
      (e) => e.department_id === deptX,
      "employee in department X",
    ).id;
    employeeInY = requireRow(
      employees as { id: string; department_id: string }[] | null,
      (e) => e.department_id === deptY,
      "employee in department Y",
    ).id;
  });

  afterAll(async () => {
    // Cascades (on delete cascade) remove departments, memberships,
    // employees, usage_events, company_llm_policy and department_llm_policy
    // rows along with the company.
    await svc.from("companies").delete().eq("id", companyId);
    if (deptAdminUserId) {
      await svc.auth.admin.deleteUser(deptAdminUserId);
    }
  });

  describe("usage_events: no prompt-text column (I3), schema-level", () => {
    test("insert with an unknown column is rejected", async () => {
      // This is a plain Postgres/PostgREST "unknown column" rejection, not
      // an RLS check -- exercised via the service-role client (which
      // bypasses RLS) precisely to isolate that it's the *schema*, not a
      // policy, doing the rejecting. usage_events has no column that could
      // hold prompt text; attempting to smuggle one in as `prompt` must
      // fail regardless of who is asking.
      const { error } = await svc.from("usage_events").insert({
        company_id: companyId,
        department_id: deptX,
        employee_id: employeeInX,
        host: "chatgpt.com",
        type: "pii_block",
        prompt: "my NRIC 900101-01-1234",
      } as Record<string, unknown>);

      expect(error).not.toBeNull();
    });

    test("insert with an invalid type value is rejected (extended type set is a closed CHECK)", async () => {
      const { error } = await svc.from("usage_events").insert({
        company_id: companyId,
        department_id: deptX,
        employee_id: employeeInX,
        host: "chatgpt.com",
        type: "not_a_real_event_type",
      });

      expect(error).not.toBeNull();
    });
  });

  describe("usage_events RLS: dept_admin reads only own-department events", () => {
    let eventInX: string;
    let eventInY: string;

    beforeAll(async () => {
      const { data, error } = await svc
        .from("usage_events")
        .insert([
          {
            company_id: companyId,
            department_id: deptX,
            employee_id: employeeInX,
            host: "chatgpt.com",
            type: "visit_unapproved",
          },
          {
            company_id: companyId,
            department_id: deptY,
            employee_id: employeeInY,
            host: "claude.ai",
            type: "warn_shown",
          },
        ])
        .select("id, department_id");
      if (error) throw error;
      eventInX = requireRow(
        data as { id: string; department_id: string }[] | null,
        (e) => e.department_id === deptX,
        "usage_event in department X",
      ).id;
      eventInY = requireRow(
        data as { id: string; department_id: string }[] | null,
        (e) => e.department_id === deptY,
        "usage_event in department Y",
      ).id;
    });

    test("dept_admin can select the event in their own department (X)", async () => {
      const asDeptAdmin = clientAsUser(deptAdminUserId);

      const { data, error } = await asDeptAdmin
        .from("usage_events")
        .select("id, department_id")
        .eq("id", eventInX);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.department_id).toBe(deptX);
    });

    test("dept_admin cannot select the event in a sibling department (Y)", async () => {
      const asDeptAdmin = clientAsUser(deptAdminUserId);

      const { data, error } = await asDeptAdmin
        .from("usage_events")
        .select("id, department_id")
        .eq("id", eventInY);

      // RLS hides a denied row by omission, not by erroring -- same
      // reasoning as every prior RLS test in this suite.
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    test("dept_admin's unfiltered usage_events scan never includes department Y", async () => {
      const asDeptAdmin = clientAsUser(deptAdminUserId);

      const { data, error } = await asDeptAdmin.from("usage_events").select("id, department_id");

      expect(error).toBeNull();
      expect(data?.some((e) => e.department_id === deptY)).toBe(false);
      expect(data?.every((e) => e.department_id === deptX)).toBe(true);
    });
  });

  describe("company_settings.allow_ignore default", () => {
    test("defaults to false when not specified on insert", async () => {
      const { data, error } = await svc
        .from("company_settings")
        .insert({ company_id: companyId })
        .select("company_id, allow_ignore, report_enabled_company, tool_recooldown_hours")
        .single();

      expect(error).toBeNull();
      expect(data?.allow_ignore).toBe(false);
      // Documented alongside allow_ignore since both are exact-default
      // assertions this task's self-review calls for.
      expect(data?.report_enabled_company).toBe(false);
      expect(data?.tool_recooldown_hours).toBe(24);
    });
  });

  describe("company_llm_policy: owner_banned default + composite PK", () => {
    test("owner_banned defaults to false, status defaults to blocked", async () => {
      const { data, error } = await svc
        .from("company_llm_policy")
        .insert({ company_id: companyId, llm_id: "openai" })
        .select("company_id, llm_id, status, owner_banned")
        .single();

      expect(error).toBeNull();
      expect(data?.owner_banned).toBe(false);
      expect(data?.status).toBe("blocked");
    });

    test("(company_id, llm_id) composite PK rejects a duplicate insert", async () => {
      const { error } = await svc
        .from("company_llm_policy")
        .insert({ company_id: companyId, llm_id: "openai" });

      // "openai" for this companyId was already inserted by the previous
      // test in this describe block; a second insert of the same pair must
      // violate the composite primary key.
      expect(error).not.toBeNull();
      expect(error?.code).toBe("23505"); // unique_violation
    });
  });

  describe("department_llm_policy RLS: dept tightening, own department only", () => {
    test("dept_admin can insert a block for a tool in their own department (X)", async () => {
      const asDeptAdmin = clientAsUser(deptAdminUserId);

      const { data, error } = await asDeptAdmin
        .from("department_llm_policy")
        .insert({ department_id: deptX, llm_id: "anthropic", status: "blocked" })
        .select("department_id, llm_id, status");

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.status).toBe("blocked");
    });

    test("dept_admin cannot insert a policy row for a sibling department (Y)", async () => {
      const asDeptAdmin = clientAsUser(deptAdminUserId);

      const { error } = await asDeptAdmin
        .from("department_llm_policy")
        .insert({ department_id: deptY, llm_id: "anthropic", status: "blocked" });

      // Unlike a denied SELECT (silent empty result), a denied INSERT's
      // `with check` clause surfaces as a real Postgres RLS error -- there
      // is no row to omit, the attempted row itself violates the policy.
      expect(error).not.toBeNull();
    });
  });
});
