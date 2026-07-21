import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { clientAsUser, serviceTestClient } from "./rls-helpers";

/**
 * Task 6 TDD test for supabase/migrations/0004_vendor_reports.sql: proves
 * `vendor_reports` is isolated by construction -- RLS enabled, zero
 * policies for `authenticated`/`anon` -- so no tenant JWT, of any role, can
 * ever read a row the service-role client inserted.
 *
 * Per task-governance-6-brief.md step 1, the required scenario is exactly:
 *   1. service-role inserts a vendor_reports row.
 *   2. a tenant (owner) JWT selects from vendor_reports.
 *   3. the tenant read returns 0 rows (RLS denies by omission, not error).
 *
 * This is the brief's literal test (service.insert -> asOwner.select ->
 * expect 0 rows), plus a small number of cases driven by this task's own
 * self-review checklist: the read is checked against an OWNER (the
 * highest-privileged tenant role in this schema -- if isolation held only
 * against a dept_admin, that would prove nothing about whether a
 * differently-scoped role could see it), a dept_admin is checked too since
 * the brief's own permission matrix lists "View vendor_reports: Owner NO,
 * Dept admin NO" as two separate denied cells, and the service-role client
 * itself is confirmed to be able to both insert AND read (proving the
 * table isn't simply broken/unreadable for everyone, which would make the
 * "0 rows for tenants" assertion vacuous).
 *
 * Both read-denial tests (owner and dept_admin) insert their own
 * uniquely-tagged row immediately before asserting the tenant read is
 * empty, rather than depending on Test 1's insert still being present at
 * that point in the file. That keeps each one provable on its own --
 * correct or incorrect regardless of execution order, and runnable in
 * isolation (e.g. `vitest -t "<name>"`) without silently degrading into
 * "0 rows because the table is empty" rather than "0 rows because RLS
 * denied a row that exists."
 *
 * Execution note: needs `supabase start` (Docker) to run for real. Not
 * executed in the environment this was written in -- see
 * task-governance-6-report.md for the self-review that stands in for
 * RED/GREEN here, same limitation as Tasks 3-5.
 */

interface CompanyRow {
  id: string;
}

function requireRow<T>(
  rows: T[] | null | undefined,
  predicate: (row: T) => boolean,
  what: string,
): T {
  const row = rows?.find(predicate);
  if (!row) {
    throw new Error(`vendor_isolation.test.ts setup: could not find seeded ${what}`);
  }
  return row;
}

describe("vendor_reports isolation (0004_vendor_reports.sql)", () => {
  const svc = serviceTestClient();

  const companyName = `Vendor Isolation Test Co ${Date.now()}-${randomUUID()}`;

  let companyId: string;
  let ownerUserId: string;
  let deptAdminUserId: string;
  let deptId: string;

  const VENDOR_REPORT_VERSION = `test-${randomUUID()}`;

  beforeAll(async () => {
    const { data: company, error: companyErr } = await svc
      .from("companies")
      .insert({ name: companyName })
      .select("id")
      .single();
    if (companyErr) throw companyErr;
    if (!company) throw new Error("vendor_isolation.test.ts setup: no company row returned");
    companyId = (company as CompanyRow).id;

    const { data: dept, error: deptErr } = await svc
      .from("departments")
      .insert({ company_id: companyId, name: `Vendor Isolation Dept ${randomUUID()}` })
      .select("id")
      .single();
    if (deptErr) throw deptErr;
    deptId = requireRow([dept] as { id: string }[] | null, () => true, "department").id;

    // Owner: the highest-privileged tenant role this schema has. If an
    // owner cannot read vendor_reports, no lesser-privileged role can
    // either -- but the matrix explicitly lists dept_admin as a separate
    // denied cell too, so both are seeded and checked.
    const { data: ownerCreated, error: ownerCreateErr } = await svc.auth.admin.createUser({
      email: `vendor-isolation-owner-${Date.now()}-${randomUUID()}@example.test`,
      password: "correct-horse-battery-staple-1!",
      email_confirm: true,
    });
    if (ownerCreateErr) throw ownerCreateErr;
    if (!ownerCreated.user) {
      throw new Error("vendor_isolation.test.ts setup: admin.createUser (owner) returned no user");
    }
    ownerUserId = ownerCreated.user.id;

    const { error: ownerMemErr } = await svc.from("memberships").insert({
      company_id: companyId,
      user_id: ownerUserId,
      role: "owner",
      department_id: null,
    });
    if (ownerMemErr) throw ownerMemErr;

    const { data: deptAdminCreated, error: deptAdminCreateErr } = await svc.auth.admin.createUser({
      email: `vendor-isolation-dept-admin-${Date.now()}-${randomUUID()}@example.test`,
      password: "correct-horse-battery-staple-1!",
      email_confirm: true,
    });
    if (deptAdminCreateErr) throw deptAdminCreateErr;
    if (!deptAdminCreated.user) {
      throw new Error(
        "vendor_isolation.test.ts setup: admin.createUser (dept_admin) returned no user",
      );
    }
    deptAdminUserId = deptAdminCreated.user.id;

    const { error: deptAdminMemErr } = await svc.from("memberships").insert({
      company_id: companyId,
      user_id: deptAdminUserId,
      role: "dept_admin",
      department_id: deptId,
    });
    if (deptAdminMemErr) throw deptAdminMemErr;
  });

  afterAll(async () => {
    // Cascades (on delete cascade) remove the department and both
    // membership rows along with the company. vendor_reports carries no
    // company_id, so any rows it inserted are cleaned up explicitly.
    // A `like` prefix match (not `eq`) because the read-denial tests below
    // each insert their own row under `${VENDOR_REPORT_VERSION}-<suffix>`,
    // not the bare `VENDOR_REPORT_VERSION` value.
    await svc.from("vendor_reports").delete().like("extension_version", `${VENDOR_REPORT_VERSION}%`);
    await svc.from("companies").delete().eq("id", companyId);
    if (ownerUserId) {
      await svc.auth.admin.deleteUser(ownerUserId);
    }
    if (deptAdminUserId) {
      await svc.auth.admin.deleteUser(deptAdminUserId);
    }
  });

  test("service-role can insert a vendor_reports row (the only writer -- Task 11's future Report route)", async () => {
    const { data, error } = await svc
      .from("vendor_reports")
      .insert({
        kind: "fp",
        class: "nric",
        scrubbed_text: "x",
        reason: "y",
        extension_version: VENDOR_REPORT_VERSION,
      })
      .select("id, kind, class, include_raw")
      .single();

    expect(error).toBeNull();
    expect(data?.kind).toBe("fp");
    expect(data?.class).toBe("nric");
    // include_raw defaults to false when not specified on insert.
    expect(data?.include_raw).toBe(false);
  });

  test("service-role can itself read the row back (proves the table isn't just universally broken)", async () => {
    const { data, error } = await svc
      .from("vendor_reports")
      .select("id, extension_version")
      .eq("extension_version", VENDOR_REPORT_VERSION);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  test("the brief's exact scenario: no tenant (owner) JWT can read vendor_reports", async () => {
    // Self-contained: this test inserts its own row (via the service-role
    // client, the only writer) rather than relying on Test 1's insert still
    // being in the table when this test runs. Without its own insert, this
    // assertion would read 0 rows whenever the table is simply empty --
    // e.g. run in isolation with `vitest -t "brief's exact scenario"`, or
    // after a reorder/`.only` -- which would pass for the wrong reason
    // (no rows exist at all) rather than the reason under test (RLS denies
    // a row that does exist). A fresh, uniquely tagged row proves the deny
    // is real, independent of any other test's execution or ordering.
    const version = `${VENDOR_REPORT_VERSION}-brief-scenario`;
    const { error: insertErr } = await svc.from("vendor_reports").insert({
      kind: "fp",
      class: "nric",
      scrubbed_text: "x",
      reason: "y",
      extension_version: version,
    });
    if (insertErr) throw insertErr;

    // Brief's literal test, reproduced with this file's own seeded fixtures
    // in place of the brief's inline `ownerJwt`/`clientWithJwt` names:
    //   await service.from('vendor_reports').insert({...});
    //   const asOwner = clientWithJwt(ownerJwt);
    //   const { data, error } = await asOwner.from('vendor_reports').select('*');
    //   expect(data ?? []).toHaveLength(0);
    const asOwner = clientAsUser(ownerUserId);

    const { data, error } = await asOwner
      .from("vendor_reports")
      .select("*")
      .eq("extension_version", version);

    // RLS hides denied rows by omission, not by erroring -- same reasoning
    // as every prior RLS test in this suite (rls_core/rls_enrollment/
    // rls_policy). Here there is no policy at all, so every row is denied
    // -- and the row this test just inserted (and is filtering down to) is
    // proof there was something to deny.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test("no dept_admin JWT can read vendor_reports either (the matrix's second denied cell)", async () => {
    // Same self-containment reasoning as the test above: insert a
    // dedicated, uniquely tagged row here rather than depending on Test 1's
    // row still existing at this point in the file/run.
    const version = `${VENDOR_REPORT_VERSION}-dept-admin-scenario`;
    const { error: insertErr } = await svc.from("vendor_reports").insert({
      kind: "fp",
      class: "nric",
      scrubbed_text: "x",
      reason: "y",
      extension_version: version,
    });
    if (insertErr) throw insertErr;

    const asDeptAdmin = clientAsUser(deptAdminUserId);

    const { data, error } = await asDeptAdmin
      .from("vendor_reports")
      .select("*")
      .eq("extension_version", version);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test("an owner JWT cannot insert into vendor_reports either (no write policy, not just no read policy)", async () => {
    const asOwner = clientAsUser(ownerUserId);

    const { error } = await asOwner.from("vendor_reports").insert({
      kind: "fn",
      class: "ssm",
      scrubbed_text: "z",
      reason: "attempted-tenant-write",
      extension_version: VENDOR_REPORT_VERSION,
    });

    // Unlike a denied SELECT (silent empty result), a denied INSERT with
    // no matching `with check` policy surfaces as a real Postgres RLS
    // error -- there is no policy at all for `authenticated` on this
    // table, for any command.
    expect(error).not.toBeNull();
  });
});
