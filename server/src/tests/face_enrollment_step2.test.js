/**
 * Automated Verification Suite for Step 2: Face Enrollment & Admin Biometrics
 * ===========================================================================
 * Verifies all security and workflow requirements from Step 2 specification:
 *   1. Explicit biometric consent enforcement.
 *   2. Self-enrollment requires admin authorization.
 *   3. Cross-employee enrollment by non-admin is rejected.
 *   4. Cross-company access is rejected (tenant isolation).
 *   5. Image format & size validation.
 *   6. Secure status retrieval (never leaks raw embedding vector).
 *   7. Revocation workflow.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../app.js";
import { query } from "../config/db.js";
import { generateToken } from "../middlewares/auth.js";

const PORT = 5092;
let server;
let baseUrl;

const companyA = "company_alpha_test";
const companyB = "company_beta_test";

const adminUser = {
  id: "test_admin_s2",
  email: "admin_s2@example.com",
  role: "admin",
  companyId: companyA
};

const employeeA1 = {
  id: "test_emp_a1_s2",
  email: "emp_a1@example.com",
  role: "employee",
  companyId: companyA
};

const employeeA2 = {
  id: "test_emp_a2_s2",
  email: "emp_a2@example.com",
  role: "employee",
  companyId: companyA
};

const employeeB = {
  id: "test_emp_b_s2",
  email: "emp_b@example.com",
  role: "employee",
  companyId: companyB
};

const adminToken = generateToken(adminUser);
const empA1Token = generateToken(employeeA1);
const empA2Token = generateToken(employeeA2);
const empBToken = generateToken(employeeB);

describe("Step 2: Face Enrollment Security & Access Control", () => {
  it("setup in-process test server and test users", async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(PORT, resolve));
    baseUrl = `http://127.0.0.1:${PORT}/api`;

    // Ensure companies exist
    await query(`INSERT INTO companies (id, name) VALUES ($1, 'Alpha Test'), ($2, 'Beta Test') ON CONFLICT (id) DO NOTHING`, [companyA, companyB]);

    // Ensure users exist
    for (const u of [adminUser, employeeA1, employeeA2, employeeB]) {
      await query(`
        INSERT INTO users (id, email, name, role, company_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, company_id = EXCLUDED.company_id
      `, [u.id, u.email, u.email, u.role, u.companyId]);
    }
  });

  it("1. Status query returns pending when not enrolled, never returns face_embedding", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/status`, {
      headers: { Authorization: `Bearer ${empA1Token}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.enrollment_status, "pending");
    assert.equal(data.is_enrolled, false);
    assert.equal(data.face_embedding, undefined, "Raw embedding must never be exposed");
  });

  it("2. Non-admin cannot view another employee's face status", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/status?userId=${employeeA2.id}`, {
      headers: { Authorization: `Bearer ${empA1Token}` }
    });
    assert.equal(res.status, 403);
  });

  it("3. Admin can view an employee's face status within their company", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/status?userId=${employeeA1.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.face_embedding, undefined, "Raw embedding must never be exposed to admin view");
  });

  it("4. Non-admin cannot authorize another employee for self-enrollment", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empA1Token}`
      },
      body: JSON.stringify({ targetUserId: employeeA2.id })
    });
    assert.equal(res.status, 403);
  });

  it("5. Admin can authorize an employee in their company for self-enrollment", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ targetUserId: employeeA1.id })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    // Verify status now shows authorized
    const statusRes = await fetch(`${baseUrl}/attendance/face/status`, {
      headers: { Authorization: `Bearer ${empA1Token}` }
    });
    const statusData = await statusRes.json();
    assert.equal(statusData.metadata?.selfEnrollmentAuthorized, true);
  });

  it("6. Admin cannot authorize an employee from a different company", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ targetUserId: employeeB.id })
    });
    assert.equal(res.status, 403);
  });

  it("7. Self-enrollment rejects if biometric consent is not given", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/enroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empA1Token}`
      },
      body: JSON.stringify({
        imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        consentGiven: false
      })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /consent/i);
  });

  it("8. Self-enrollment rejects if employee was not authorized by admin", async () => {
    // Employee A2 has NOT been authorized
    const res = await fetch(`${baseUrl}/attendance/face/enroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empA2Token}`
      },
      body: JSON.stringify({
        imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        consentGiven: true
      })
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /authorized/i);
  });

  it("9. Non-admin cannot enroll biometrics for another user", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/enroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empA1Token}`
      },
      body: JSON.stringify({
        targetUserId: employeeA2.id,
        imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        consentGiven: true
      })
    });
    assert.equal(res.status, 403);
  });

  it("10. Rejects invalid / malformed image data before contacting service", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/enroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empA1Token}`
      },
      body: JSON.stringify({
        imageBase64: "too-short",
        consentGiven: true
      })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /small|photograph/i);
  });

  it("11. Revocation resets enrollment status and clears embedding", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        targetUserId: employeeA1.id,
        reason: "Security audit reset"
      })
    });
    assert.equal(res.status, 200);

    const check = await query("SELECT enrollment_status, face_embedding FROM employee_face_profiles WHERE user_id = $1", [employeeA1.id]);
    assert.equal(check.rows[0].enrollment_status, "suspended");
    assert.equal(check.rows[0].face_embedding, null);
  });

  it("cleanup test database records and close server", async () => {
    await query("DELETE FROM employee_face_profiles WHERE user_id IN ($1, $2, $3, $4)", [
      adminUser.id, employeeA1.id, employeeA2.id, employeeB.id
    ]);
    await query("DELETE FROM users WHERE id IN ($1, $2, $3, $4)", [
      adminUser.id, employeeA1.id, employeeA2.id, employeeB.id
    ]);
    await new Promise((resolve) => server.close(resolve));
  });
});
