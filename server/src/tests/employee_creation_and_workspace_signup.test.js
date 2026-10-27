import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import app from "../app.js";
import { query } from "../config/db.js";

const JWT_SECRET = process.env.JWT_SECRET || "hrms_jwt_super_secret_railway_2026";

test("Employee Creation and Workspace Signup Test Suite", async (t) => {
  let server;
  let baseUrl;

  // Start in-process test server
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api`;
      resolve();
    });
  });

  const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const testPassword = "Password123!@#";
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(testPassword, salt);

  // Seed two distinct companies for multi-tenant isolation testing
  const compAId = `comp_test_a_${uniqueSuffix}`;
  const compASlug = `slug-test-a-${uniqueSuffix}`;
  const compBId = `comp_test_b_${uniqueSuffix}`;
  const compBSlug = `slug-test-b-${uniqueSuffix}`;
  const deactCompId = `comp_deact_${uniqueSuffix}`;
  const deactCompSlug = `slug-deact-${uniqueSuffix}`;

  await query(
    `INSERT INTO companies (id, name, slug, status)
     VALUES ($1, 'Tenant A Corp', $2, 'active'),
            ($3, 'Tenant B Corp', $4, 'active'),
            ($5, 'Deactivated Corp', $6, 'deactive')`,
    [compAId, compASlug, compBId, compBSlug, deactCompId, deactCompSlug]
  );

  // Seed Admin in Company A
  const adminAId = `usr_admin_a_${uniqueSuffix}`;
  const adminAEmail = `admin_a_${uniqueSuffix}@tenanta.com`;
  await query(
    `INSERT INTO users (id, email, password_hash, name, role, company_id, status)
     VALUES ($1, $2, $3, 'Admin Tenant A', 'admin', $4, 'active')`,
    [adminAId, adminAEmail, passwordHash, compAId]
  );
  const adminAToken = jwt.sign(
    { id: adminAId, email: adminAEmail, role: "admin", companyId: compAId },
    JWT_SECRET
  );

  // Seed Regular Employee in Company A (to test authorization)
  const empAId = `usr_emp_a_${uniqueSuffix}`;
  const empAEmail = `emp_a_${uniqueSuffix}@tenanta.com`;
  await query(
    `INSERT INTO users (id, email, password_hash, name, role, company_id, status)
     VALUES ($1, $2, $3, 'Employee Tenant A', 'employee', $4, 'active')`,
    [empAId, empAEmail, passwordHash, compAId]
  );
  const empAToken = jwt.sign(
    { id: empAId, email: empAEmail, role: "employee", companyId: compAId },
    JWT_SECRET
  );

  // Track created user IDs for teardown
  const createdUserIds = [adminAId, empAId];

  // ==========================================
  // ISSUE 1: ADMIN EMPLOYEE CREATION TESTS
  // ==========================================

  await t.test("1.1 Admin successfully creates an employee via POST /api/users", async () => {
    const newEmpEmail = `created_emp_${uniqueSuffix}@example.com`;
    const res = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminAToken}`
      },
      body: JSON.stringify({
        name: "Jane Developer",
        email: newEmpEmail,
        password: "Welcome@123",
        department: "Engineering",
        designation: "Frontend Engineer",
        employeeId: "EMP-9001",
        shiftStart: "09:00",
        shiftEnd: "18:00"
      })
    });

    const data = await res.json();
    assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}: ${JSON.stringify(data)}`);
    assert.ok(data.user, "Should return created user object");
    assert.equal(data.user.name, "Jane Developer");
    assert.equal(data.user.email, newEmpEmail);
    assert.equal(data.user.department, "Engineering");
    assert.equal(data.user.company_id, compAId, "Employee must be associated with the admin's company");
    assert.equal(data.user.employee_id, "EMP-9001");
    createdUserIds.push(data.user.id);

    // Verify in database
    const dbCheck = await query("SELECT * FROM users WHERE id = $1", [data.user.id]);
    assert.equal(dbCheck.rows.length, 1);
    assert.equal(dbCheck.rows[0].company_id, compAId);
  });

  await t.test("1.2 Missing required fields in POST /api/users returns 400", async () => {
    const res = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminAToken}`
      },
      body: JSON.stringify({
        department: "Engineering"
        // missing name and email
      })
    });

    const data = await res.json();
    assert.equal(res.status, 400, "Should return 400 for missing required fields");
    assert.ok(data.error);
  });

  await t.test("1.3 Regular employee cannot create users (403 Forbidden)", async () => {
    const res = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empAToken}`
      },
      body: JSON.stringify({
        name: "Hacker Employee",
        email: `hacker_${uniqueSuffix}@example.com`,
        department: "Engineering"
      })
    });

    assert.equal(res.status, 403, "Non-admin must be forbidden from creating employees");
  });

  await t.test("1.4 Tenant Isolation: Admin of Tenant A cannot assign employee to Tenant B", async () => {
    const crossTenantEmail = `cross_tenant_${uniqueSuffix}@example.com`;
    const res = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminAToken}`
      },
      body: JSON.stringify({
        name: "Cross Tenant Attempt",
        email: crossTenantEmail,
        companyId: compBId // Attempt to inject into Tenant B
      })
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.user.company_id, compAId, "Target company must be locked to admin's own company");
    createdUserIds.push(data.user.id);
  });

  // ==========================================
  // ISSUE 2: WORKSPACE SIGNUP TESTS
  // ==========================================

  await t.test("2.1 Valid signup with legitimate workspace slug succeeds and assigns company_id", async () => {
    const signupEmail = `signup_valid_${uniqueSuffix}@example.com`;
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Valid Signup User",
        email: signupEmail,
        password: "ValidPassword123!",
        department: "Design",
        companySlug: compASlug
      })
    });

    const data = await res.json();
    assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}: ${JSON.stringify(data)}`);
    assert.ok(data.user, "Should return user");
    assert.equal(data.user.company_id, compAId, "Should correctly resolve companySlug to company_id");
    createdUserIds.push(data.user.id);

    // Verify in database that company_id is NOT null
    const dbCheck = await query("SELECT company_id FROM users WHERE id = $1", [data.user.id]);
    assert.equal(dbCheck.rows[0].company_id, compAId);
  });

  await t.test("2.2 Signup with nonexistent workspace slug returns 404", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Nonexistent Org User",
        email: `ghost_org_${uniqueSuffix}@example.com`,
        password: "ValidPassword123!",
        companySlug: "nonexistent-workspace-slug-404"
      })
    });

    const data = await res.json();
    assert.equal(res.status, 404, "Should return 404 for invalid/missing workspace slug");
    assert.ok(data.error.includes("not found"));
  });

  await t.test("2.3 Signup with deactivated workspace returns 400", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Deactivated Org User",
        email: `deact_user_${uniqueSuffix}@example.com`,
        password: "ValidPassword123!",
        companySlug: deactCompSlug
      })
    });

    const data = await res.json();
    assert.equal(res.status, 400, "Should return 400 for deactivated workspace");
    assert.ok(data.error.toLowerCase().includes("deactivated"));
  });

  await t.test("2.4 Public signup without any workspace context returns 400 (prevents orphaned users)", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Orphan Attempt User",
        email: `orphan_${uniqueSuffix}@genericemail.com`,
        password: "ValidPassword123!"
        // No companySlug, no companyId
      })
    });

    const data = await res.json();
    assert.equal(res.status, 400, "Should reject signup without workspace context");
    assert.ok(data.error.toLowerCase().includes("workspace"));

    // Verify NO user was inserted into DB with NULL company_id
    const dbCheck = await query("SELECT id FROM users WHERE email = $1", [`orphan_${uniqueSuffix}@genericemail.com`]);
    assert.equal(dbCheck.rows.length, 0, "No orphaned record should exist");
  });

  // Teardown test artifacts
  t.after(async () => {
    if (createdUserIds.length > 0) {
      await query("DELETE FROM users WHERE id = ANY($1)", [createdUserIds]);
    }
    await query("DELETE FROM companies WHERE id IN ($1, $2, $3)", [compAId, compBId, deactCompId]);
    await new Promise((resolve) => server.close(resolve));
  });
});
