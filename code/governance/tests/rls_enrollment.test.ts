import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { clientAsUser, serviceTestClient } from "./rls-helpers";

/**
 * Task 4 TDD test for the `employees_read` / `employees_update` RLS policies
 * and the `enroll_tokens` schema-level invariants added in
 * supabase/migrations/0002_enrollment.sql, against a real local Supabase
 * stack.
 *
 * Task 3's test (rls_core.test.ts) proved cross-*tenant* isolation (company A
 * vs company B). This task's brief scenario is narrower and, per the task
 * instructions, deliberately different in shape: one company, two
 * *departments*, one dept_admin scoped to only one of them -- proving
 * `can_admin_department` denies a sibling department inside the SAME company,
 * not just a different company (a stricter check: `is_owner` can't
 * accidentally paper over a same-company leak the way it might across
 * companies).
 *
 * Three brief scenarios (task-governance-4-brief.md step 1):
 *   1. a dept_admin can select/update employees only in their own
 *      department, not a sibling department in the same company.
 *   2. revoking an employee sets `status='revoked'`.
 *   3. a token with `consumed_at` already set cannot be consumed twice.
 *
 * (3) is a schema-level guarantee, not a route-handler test (Task 8 owns the
 * actual /api/v1/enroll consume logic) -- exercised here as the same
 * conditional `update ... where consumed_at is null` pattern the real
 * handler will use, run twice against the same row via the service-role
 * client (token consumption is performed by the extension, which holds no
 * Supabase session -- see the plan's "Extension endpoints do not use RLS"
 * note -- so this is deliberately not run through `clientAsUser`).
 *
 * Execution note: needs `supabase start` (Docker) to run for real. Not
 * executed in the environment this was written in -- see
 * task-governance-4-report.md for the self-review that stands in for
 * RED/GREEN here, same limitation as Task 3.
 */

interface CompanyRow {
  id: string;
}

interface DepartmentRow {
  id: string;
  name: string;
}

interface EmployeeRow {
  id: string;
  department_id: string;
  status: string;
}

function requireRow<T>(
  rows: T[] | null | undefined,
  predicate: (row: T) => boolean,
  what: string,
): T {
  const row = rows?.find(predicate);
  if (!row) {
    throw new Error(`rls_enrollment.test.ts setup: could not find seeded ${what}`);
  }
  return row;
}

describe("employees RLS: can_admin_department, same-company cross-department", () => {
  const svc = serviceTestClient();

  // Fresh UUID suffix per row, same reasoning as rls_core.test.ts: a
  // Date.now()-only name can collide and silently turn a cross-department
  // assertion into a same-department no-op.
  const companyName = `RLS Enrollment Test Co ${Date.now()}-${randomUUID()}`;
  const deptXName = `Dept X ${randomUUID()}`;
  const deptYName = `Dept Y ${randomUUID()}`;

  let companyId: string;
  let deptX: string; // the dept_admin's own department
  let deptY: string; // a sibling department, same company
  let deptAdminUserId: string;
  let employeeInX: string;
  let employeeInY: string;

  beforeAll(async () => {
    // --- one company ---
    const { data: companies, error: companyErr } = await svc
      .from("companies")
      .insert({ name: companyName })
      .select("id");
    if (companyErr) throw companyErr;
    companyId = requireRow(companies as CompanyRow[] | null, () => true, "company").id;

    // --- two departments in that one company ---
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

    // --- a real auth user, scoped as dept_admin of dept X only ---
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email: `rls-enrollment-dept-admin-${Date.now()}-${randomUUID()}@example.test`,
      password: "correct-horse-battery-staple-1!",
      email_confirm: true,
    });
    if (createErr) throw createErr;
    if (!created.user) {
      throw new Error("rls_enrollment.test.ts setup: admin.createUser returned no user");
    }
    deptAdminUserId = created.user.id;

    const { error: memErr } = await svc.from("memberships").insert({
      company_id: companyId,
      user_id: deptAdminUserId,
      role: "dept_admin",
      department_id: deptX,
    });
    if (memErr) throw memErr;

    // --- one employee per department, seeded directly (service-role
    // bypasses RLS -- employees are normally minted by Task 8's
    // service-role-guarded /api/v1/enroll route, never by an authenticated
    // dashboard insert, so there is no employees_insert RLS policy to test
    // here at all) ---
    const { data: employees, error: employeesErr } = await svc
      .from("employees")
      .insert([
        { company_id: companyId, department_id: deptX, pseudo_id: `pseudo-x-${randomUUID()}` },
        { company_id: companyId, department_id: deptY, pseudo_id: `pseudo-y-${randomUUID()}` },
      ])
      .select("id, department_id, status");
    if (employeesErr) throw employeesErr;
    employeeInX = requireRow(
      employees as EmployeeRow[] | null,
      (e) => e.department_id === deptX,
      "employee in department X",
    ).id;
    employeeInY = requireRow(
      employees as EmployeeRow[] | null,
      (e) => e.department_id === deptY,
      "employee in department Y",
    ).id;
  });

  afterAll(async () => {
    // Cascades (on delete cascade) remove departments, memberships and
    // employees along with the company.
    await svc.from("companies").delete().eq("id", companyId);
    if (deptAdminUserId) {
      await svc.auth.admin.deleteUser(deptAdminUserId);
    }
  });

  test("dept_admin can select the employee in their own department (X)", async () => {
    const asDeptAdmin = clientAsUser(deptAdminUserId);

    const { data, error } = await asDeptAdmin
      .from("employees")
      .select("id, department_id, status")
      .eq("id", employeeInX);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.department_id).toBe(deptX);
  });

  test("dept_admin cannot select the employee in a sibling department (Y), same company", async () => {
    const asDeptAdmin = clientAsUser(deptAdminUserId);

    // RLS hides a denied row by omission, not by erroring -- see
    // rls_core.test.ts for the same reasoning. The important assertion is
    // the empty array, not just `error === null`.
    const { data, error } = await asDeptAdmin
      .from("employees")
      .select("id, department_id, status")
      .eq("id", employeeInY);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  test("dept_admin's unfiltered employees scan never includes department Y", async () => {
    const asDeptAdmin = clientAsUser(deptAdminUserId);

    const { data, error } = await asDeptAdmin.from("employees").select("id, department_id");

    expect(error).toBeNull();
    expect(data?.some((e) => e.department_id === deptY)).toBe(false);
    expect(data?.every((e) => e.department_id === deptX)).toBe(true);
  });

  test("dept_admin can revoke (update status) the employee in their own department", async () => {
    const asDeptAdmin = clientAsUser(deptAdminUserId);

    const { data, error } = await asDeptAdmin
      .from("employees")
      .update({ status: "revoked" })
      .eq("id", employeeInX)
      .select("id, status");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.status).toBe("revoked");

    // Confirm via the service-role client too, independent of RLS.
    const { data: confirmed, error: confirmErr } = await svc
      .from("employees")
      .select("status")
      .eq("id", employeeInX)
      .single();
    expect(confirmErr).toBeNull();
    expect(confirmed?.status).toBe("revoked");
  });

  test("dept_admin cannot update (revoke) the employee in a sibling department (Y)", async () => {
    const asDeptAdmin = clientAsUser(deptAdminUserId);

    const { data, error } = await asDeptAdmin
      .from("employees")
      .update({ status: "revoked" })
      .eq("id", employeeInY)
      .select("id, status");

    // Same "denied by omission" shape as the select case: the row is
    // invisible to the update's own using-clause, so 0 rows are affected --
    // not an error.
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    // The service-role read confirms the sibling-department employee's
    // status was genuinely untouched, not just excluded from the response.
    const { data: unchanged, error: unchangedErr } = await svc
      .from("employees")
      .select("status")
      .eq("id", employeeInY)
      .single();
    expect(unchangedErr).toBeNull();
    expect(unchanged?.status).toBe("active");
  });
});

describe("enroll_tokens: one-person one-time schema invariants", () => {
  const svc = serviceTestClient();

  const companyName = `RLS Token Test Co ${Date.now()}-${randomUUID()}`;
  const deptName = `Token Dept ${randomUUID()}`;

  let companyId: string;
  let departmentId: string;
  let creatorUserId: string; // enroll_tokens.created_by -> auth.users(id)
  let employeeId: string; // a row to link consumed_employee_id to

  beforeAll(async () => {
    const { data: company, error: companyErr } = await svc
      .from("companies")
      .insert({ name: companyName })
      .select("id")
      .single();
    if (companyErr) throw companyErr;
    if (!company) throw new Error("rls_enrollment.test.ts setup: no company row returned");
    companyId = (company as CompanyRow).id;

    const { data: dept, error: deptErr } = await svc
      .from("departments")
      .insert({ company_id: companyId, name: deptName })
      .select("id")
      .single();
    if (deptErr) throw deptErr;
    if (!dept) throw new Error("rls_enrollment.test.ts setup: no department row returned");
    departmentId = (dept as DepartmentRow).id;

    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email: `rls-token-creator-${Date.now()}-${randomUUID()}@example.test`,
      password: "correct-horse-battery-staple-1!",
      email_confirm: true,
    });
    if (createErr) throw createErr;
    if (!created.user) {
      throw new Error("rls_enrollment.test.ts setup: admin.createUser returned no user");
    }
    creatorUserId = created.user.id;

    const { data: employee, error: employeeErr } = await svc
      .from("employees")
      .insert({
        company_id: companyId,
        department_id: departmentId,
        pseudo_id: `pseudo-token-${randomUUID()}`,
      })
      .select("id")
      .single();
    if (employeeErr) throw employeeErr;
    if (!employee) throw new Error("rls_enrollment.test.ts setup: no employee row returned");
    employeeId = (employee as Pick<EmployeeRow, "id">).id;
  });

  afterAll(async () => {
    await svc.from("companies").delete().eq("id", companyId);
    if (creatorUserId) {
      await svc.auth.admin.deleteUser(creatorUserId);
    }
  });

  test("a token with consumed_at already set cannot be consumed twice", async () => {
    const { data: token, error: tokenErr } = await svc
      .from("enroll_tokens")
      .insert({
        company_id: companyId,
        department_id: departmentId,
        token_hash: `hash-${randomUUID()}`,
        label: "double-consume test token",
        created_by: creatorUserId,
      })
      .select("id, consumed_at")
      .single();
    if (tokenErr) throw tokenErr;
    expect(token?.consumed_at).toBeNull();

    // This is the conditional-update pattern the real /api/v1/enroll route
    // (Task 8) will use to consume a token exactly once: `where
    // consumed_at is null`. First attempt should succeed and affect the row.
    const firstAttempt = await svc
      .from("enroll_tokens")
      .update({ consumed_at: new Date().toISOString(), consumed_employee_id: employeeId })
      .eq("id", token.id)
      .is("consumed_at", null)
      .select("id, consumed_at, consumed_employee_id");

    expect(firstAttempt.error).toBeNull();
    expect(firstAttempt.data).toHaveLength(1);
    expect(firstAttempt.data?.[0]?.consumed_employee_id).toBe(employeeId);

    // Second attempt targets the same row with the same `consumed_at is
    // null` guard. Since the first attempt already set consumed_at, the
    // guard now excludes this row -- 0 rows affected, proving the schema
    // (via the conditional update it's designed to be driven by) represents
    // "already consumed" as a state a second consume cannot succeed against,
    // without needing any app-layer logic to be present.
    const secondAttempt = await svc
      .from("enroll_tokens")
      .update({ consumed_at: new Date().toISOString(), consumed_employee_id: employeeId })
      .eq("id", token.id)
      .is("consumed_at", null)
      .select("id");

    expect(secondAttempt.error).toBeNull();
    expect(secondAttempt.data).toHaveLength(0);
  });

  test("max_uses is constrained to 1 by a CHECK constraint, not left open", async () => {
    const { error } = await svc.from("enroll_tokens").insert({
      company_id: companyId,
      department_id: departmentId,
      token_hash: `hash-${randomUUID()}`,
      label: "attempted multi-use token",
      created_by: creatorUserId,
      max_uses: 2,
    });

    // A CHECK violation is a real Postgres error (23514), not a silently
    // clamped value -- confirms the one-person guarantee can't be widened by
    // simply inserting a different number.
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/max_uses/);
  });

  test("consumed_at and consumed_employee_id must be set together", async () => {
    const { error } = await svc.from("enroll_tokens").insert({
      company_id: companyId,
      department_id: departmentId,
      token_hash: `hash-${randomUUID()}`,
      label: "half-consumed token attempt",
      created_by: creatorUserId,
      consumed_at: new Date().toISOString(),
      // consumed_employee_id deliberately omitted
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/consumed_together/);
  });
});
