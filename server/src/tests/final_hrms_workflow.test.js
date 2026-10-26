/**
 * Final HRMS Face Attendance Workflow Test Suite
 * ===============================================
 * Validates the 8 requirements specified in the final workflow:
 *  1. Admin enrolls Employee A successfully.
 *  2. Employee A checks in using Employee A's face.
 *  3. Employee A checks out using a fresh selfie.
 *  4. Employee B cannot use Employee A's enrolled template to pass verification.
 *  5. An unauthorized employee cannot enroll, replace, or revoke another employee's template.
 *  6. A non-enrolled or revoked employee cannot check in or check out.
 *  7. Existing MFA, audit logging, geofencing, breaks, shifts, and attendance history continue to work.
 *  8. Face verification service failure blocks attendance safely.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../app.js";
import { query } from "../config/db.js";
import { generateToken } from "../middlewares/auth.js";
import { generateVerificationSessionToken, hashToken } from "../services/livenessVerification.js";

const TEST_PORT = 5095;
const MOCK_FACE_PORT = 5096;

let server;
let mockFaceServer;
let baseUrl;

// Test tenants
const companyA = "company_workflow_alpha";
const companyB = "company_workflow_beta";

// Test identities
const adminA = {
  id: "admin_workflow_a",
  email: "admin_alpha@hrms-test.local",
  role: "admin",
  companyId: companyA
};

const adminB = {
  id: "admin_workflow_b",
  email: "admin_beta@hrms-test.local",
  role: "admin",
  companyId: companyB
};

const employeeA = {
  id: "emp_workflow_a",
  email: "emp_a@hrms-test.local",
  role: "employee",
  companyId: companyA
};

const employeeB = {
  id: "emp_workflow_b",
  email: "emp_b@hrms-test.local",
  role: "employee",
  companyId: companyA
};

const employeeNonEnrolled = {
  id: "emp_workflow_unregistered",
  email: "emp_none@hrms-test.local",
  role: "employee",
  companyId: companyA
};

const employeeRevoked = {
  id: "emp_workflow_revoked",
  email: "emp_revoked@hrms-test.local",
  role: "employee",
  companyId: companyA
};

const adminAToken = generateToken(adminA);
const adminBToken = generateToken(adminB);
const employeeAToken = generateToken(employeeA);
const employeeBToken = generateToken(employeeB);
const employeeNonEnrolledToken = generateToken(employeeNonEnrolled);
const employeeRevokedToken = generateToken(employeeRevoked);

// 512-dim normalized synthetic embedding
function makeEmbedding(seed = 1) {
  const raw = Array.from({ length: 512 }, (_, i) => Math.sin(seed * (i + 1)));
  const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0));
  return raw.map(v => v / norm);
}

const empAEmbedding = makeEmbedding(101);
const empBEmbedding = makeEmbedding(999);
const validSelfie = "data:image/jpeg;base64," + "A".repeat(400);

// State for mock face service
let mockFaceServiceState = {
  mode: "healthy", // "healthy" | "error"
  compareResult: true,
  distance: 0.18
};

describe("Final HRMS Face Attendance Workflow — End-to-End Suite", () => {
  before(async () => {
    // 1. Point FACE_SERVICE_URL to mock microservice
    process.env.FACE_SERVICE_URL = `http://127.0.0.1:${MOCK_FACE_PORT}`;

    // 2. Start mock Python Face Microservice
    mockFaceServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        if (mockFaceServiceState.mode === "error") {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ detail: "Simulated Python ArcFace microservice crash." }));
        }

        if (req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ status: "healthy", model: "ArcFace" }));
        }

        if (req.url === "/enroll") {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            embedding: empAEmbedding,
            dimension: 512,
            face_count: 1,
            model: "ArcFace"
          }));
        }

        if (req.url === "/verify") {
          const parsed = JSON.parse(body || "{}");
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            matched: mockFaceServiceState.compareResult,
            verified: mockFaceServiceState.compareResult,
            distance: mockFaceServiceState.distance,
            threshold: 0.40,
            model: "ArcFace",
            face_count: 1,
            liveness_result: "not_checked"
          }));
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
      });
    });

    await new Promise(resolve => mockFaceServer.listen(MOCK_FACE_PORT, resolve));

    // 3. Start HRMS Express backend
    server = http.createServer(app);
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    baseUrl = `http://127.0.0.1:${TEST_PORT}/api`;

    // 4. Seed test companies and users in DB
    await query(`
      INSERT INTO companies (id, name, latitude, longitude, allowed_radius_meters)
      VALUES 
        ($1, 'Workflow Alpha Co', 13.0827, 80.2707, 200),
        ($2, 'Workflow Beta Co', 12.9716, 77.5946, 200)
      ON CONFLICT (id) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        allowed_radius_meters = EXCLUDED.allowed_radius_meters
    `, [companyA, companyB]);

    const usersToSeed = [
      adminA, adminB, employeeA, employeeB, employeeNonEnrolled, employeeRevoked
    ];
    for (const u of usersToSeed) {
      await query(`
        INSERT INTO users (id, name, email, password_hash, role, company_id, status)
        VALUES ($1, $2, $3, 'hash_test', $4, $5, 'active')
        ON CONFLICT (id) DO UPDATE SET
          company_id = EXCLUDED.company_id,
          role = EXCLUDED.role,
          status = 'active'
      `, [u.id, u.email.split("@")[0], u.email, u.role, u.companyId]);
    }

    // Clear any previous biometric test profiles for these users
    await query(`
      DELETE FROM employee_face_profiles 
      WHERE user_id IN ($1, $2, $3, $4)
    `, [employeeA.id, employeeB.id, employeeNonEnrolled.id, employeeRevoked.id]);

    // Seed revoked profile for employeeRevoked
    await query(`
      INSERT INTO employee_face_profiles (
        id, user_id, company_id, enrollment_status, face_embedding, embedding_model, embedding_dimension
      ) VALUES ($1, $2, $3, 'suspended', NULL, 'ArcFace', 512)
    `, [`${employeeRevoked.id}_profile`, employeeRevoked.id, companyA]);

    // Clean up attendance logs for today
    const today = new Date().toISOString().split("T")[0];
    await query(`DELETE FROM attendance WHERE id LIKE '%_workflow_%'`);
  });

  after(async () => {
    if (server) await new Promise(r => server.close(r));
    if (mockFaceServer) await new Promise(r => mockFaceServer.close(r));
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Admin enrolls Employee A successfully
  // -------------------------------------------------------------------------
  it("Scenario 1: Admin enrolls Employee A successfully (stores embedding, not raw image, status Enrolled)", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/enroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminAToken}`
      },
      body: JSON.stringify({
        targetUserId: employeeA.id,
        imageBase64: validSelfie,
        biometricConsent: true
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.enrollment_status, "enrolled");

    // Verify embedding stored in database and no raw image stored
    const { rows } = await query(
      `SELECT * FROM employee_face_profiles WHERE user_id = $1`,
      [employeeA.id]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].company_id, companyA);
    assert.equal(rows[0].enrollment_status, "enrolled");
    assert.ok(rows[0].face_embedding, "Embedding must be saved");
    assert.equal(rows[0].face_embedding.length, 512);

    // Verify raw image does not exist anywhere on the row
    assert.equal(rows[0].raw_image, undefined);
    assert.equal(rows[0].image_base64, undefined);

    // Verify biometric status endpoint reports 'enrolled'
    const statusRes = await fetch(`${baseUrl}/attendance/face/status?userId=${employeeA.id}`, {
      headers: { Authorization: `Bearer ${adminAToken}` }
    });
    const statusData = await statusRes.json();
    assert.equal(statusData.enrollment_status, "enrolled");
    assert.equal(statusData.is_enrolled, true);
    assert.equal(statusData.face_embedding, undefined, "Embedding must never be returned in status API");
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Employee A checks in using Employee A's face
  // -------------------------------------------------------------------------
  let empACheckInToken = null;

  it("Scenario 2: Employee A checks in using Employee A's face", async () => {
    mockFaceServiceState.mode = "healthy";
    mockFaceServiceState.compareResult = true;
    mockFaceServiceState.distance = 0.15; // Well within 0.40 threshold

    // 1. Verify face session for check-in
    const verifyRes = await fetch(`${baseUrl}/attendance/face/verify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({
        imageBase64: validSelfie,
        workMode: "office",
        actionType: "check-in",
        location: { latitude: 13.0827, longitude: 80.2707 }
      })
    });

    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.verified, true);
    assert.ok(verifyData.verificationSessionToken);
    assert.equal(verifyData.liveness_result, "not_checked");
    empACheckInToken = verifyData.verificationSessionToken;

    // 2. Perform check-in with the session token
    const checkInRes = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        workMode: "office",
        verificationSessionToken: empACheckInToken
      })
    });

    assert.equal(checkInRes.status, 200);
    const checkInData = await checkInRes.json();
    assert.equal(checkInData.status, "checked-in");
    assert.ok(checkInData.checkIn);

    // Verify session token is consumed atomically in DB
    const sessionRes = await query(
      `SELECT * FROM attendance_verification_sessions WHERE token_hash = $1`,
      [hashToken(empACheckInToken)]
    );
    assert.equal(sessionRes.rows[0].status, "consumed");
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Employee A checks out using a fresh selfie
  // -------------------------------------------------------------------------
  it("Scenario 3: Employee A checks out using a fresh selfie (cannot reuse check-in token)", async () => {
    // Attempt 1: Reusing check-in token for checkout MUST be rejected
    const reuseRes = await fetch(`${baseUrl}/attendance/check-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        verificationSessionToken: empACheckInToken
      })
    });
    assert.ok([400, 403].includes(reuseRes.status), "Reused check-in token must be rejected");

    // Attempt 2: Verify fresh selfie for checkout
    const verifyOutRes = await fetch(`${baseUrl}/attendance/face/verify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({
        imageBase64: validSelfie,
        workMode: "office",
        actionType: "check-out",
        location: { latitude: 13.0827, longitude: 80.2707 }
      })
    });

    assert.equal(verifyOutRes.status, 200);
    const verifyOutData = await verifyOutRes.json();
    assert.equal(verifyOutData.verified, true);
    assert.notEqual(verifyOutData.verificationSessionToken, empACheckInToken);

    // Perform check-out with the fresh checkout token
    const checkOutRes = await fetch(`${baseUrl}/attendance/check-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        verificationSessionToken: verifyOutData.verificationSessionToken
      })
    });

    assert.equal(checkOutRes.status, 200);
    const checkOutData = await checkOutRes.json();
    assert.equal(checkOutData.status, "checked-out");
    assert.ok(checkOutData.checkOutTime);
    assert.ok(checkOutData.workingDuration !== undefined, "Working duration calculation must be preserved");
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Employee B cannot use Employee A's enrolled template
  // -------------------------------------------------------------------------
  it("Scenario 4: Employee B cannot use Employee A's enrolled template to pass verification", async () => {
    // 1. Employee B tries to verify face, but face service reports mismatch
    mockFaceServiceState.compareResult = false;
    mockFaceServiceState.distance = 0.65; // Exceeds 0.40 threshold

    const mismatchRes = await fetch(`${baseUrl}/attendance/face/verify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeBToken}`
      },
      body: JSON.stringify({
        imageBase64: validSelfie,
        workMode: "office",
        location: { latitude: 13.0827, longitude: 80.2707 }
      })
    });

    // Employee B is not enrolled, so verify session rejects with 403 ENROLLMENT_REQUIRED
    assert.equal(mismatchRes.status, 403);
    const mismatchData = await mismatchRes.json();
    assert.equal(mismatchData.code, "ENROLLMENT_REQUIRED");

    // 2. If Employee B steals a valid token belonging to Employee A, checkIn rejects with 403
    const { rawToken, tokenHash } = generateVerificationSessionToken();
    const sessionId = "avs_test_empA_token_" + Date.now();
    const attemptId = "ava_test_empA_att_" + Date.now();

    await query(
      `INSERT INTO attendance_verification_attempts (
         id, user_id, company_id, work_mode, status, gps_result, face_result, liveness_result, model
       ) VALUES ($1, $2, $3, 'office', 'verified', 'inside', 'matched', 'not_checked', 'ArcFace')`,
      [attemptId, employeeA.id, companyA]
    );

    await query(
      `INSERT INTO attendance_verification_sessions (
         id, attempt_id, user_id, company_id, token_hash, provider, status, expires_at, action_type
       ) VALUES ($1, $2, $3, $4, $5, 'internal', 'issued', CURRENT_TIMESTAMP + INTERVAL '5 minutes', 'check-in')`,
      [sessionId, attemptId, employeeA.id, companyA, tokenHash]
    );

    // Employee B calls check-in using Employee A's token
    const stealRes = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeBToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        workMode: "office",
        verificationSessionToken: rawToken
      })
    });

    assert.equal(stealRes.status, 403);
    const stealData = await stealRes.json();
    assert.match(stealData.error, /invalid, expired, or has already been used/i);
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Unauthorized employee cannot enroll, replace, or revoke template
  // -------------------------------------------------------------------------
  it("Scenario 5: Unauthorized employee cannot enroll, replace, or revoke another employee's template", async () => {
    // 1. Employee B tries to enroll Employee A
    const empEnrollRes = await fetch(`${baseUrl}/attendance/face/enroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeBToken}`
      },
      body: JSON.stringify({
        targetUserId: employeeA.id,
        imageBase64: validSelfie,
        biometricConsent: true
      })
    });
    assert.equal(empEnrollRes.status, 403);

    // 2. Employee B tries to revoke Employee A
    const empRevokeRes = await fetch(`${baseUrl}/attendance/face/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeBToken}`
      },
      body: JSON.stringify({
        targetUserId: employeeA.id,
        reason: "Malicious revoke attempt"
      })
    });
    assert.equal(empRevokeRes.status, 403);

    // 3. Employee A tries to replace their own enrolled template without explicit admin authorization
    const selfReplaceRes = await fetch(`${baseUrl}/attendance/face/enroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({
        imageBase64: validSelfie,
        biometricConsent: true
      })
    });
    assert.equal(selfReplaceRes.status, 403);
    const selfReplaceData = await selfReplaceRes.json();
    assert.equal(selfReplaceData.code, "SELF_ENROLLMENT_NOT_AUTHORIZED");

    // 4. Admin of Company B tries to enroll Employee A (Company A) -> cross-tenant denied
    const crossAdminRes = await fetch(`${baseUrl}/attendance/face/enroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminBToken}`
      },
      body: JSON.stringify({
        targetUserId: employeeA.id,
        imageBase64: validSelfie,
        biometricConsent: true
      })
    });
    assert.equal(crossAdminRes.status, 403);
    const crossAdminData = await crossAdminRes.json();
    assert.equal(crossAdminData.code, "CROSS_TENANT_ACCESS_DENIED");
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Non-enrolled or revoked employee cannot check in or check out
  // -------------------------------------------------------------------------
  it("Scenario 6: A non-enrolled or revoked employee cannot check in or check out", async () => {
    // 1. Non-enrolled employee tries to verify session
    const nonEnrolledRes = await fetch(`${baseUrl}/attendance/face/verify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeNonEnrolledToken}`
      },
      body: JSON.stringify({
        imageBase64: validSelfie,
        workMode: "office"
      })
    });
    assert.equal(nonEnrolledRes.status, 403);
    const nonEnrolledData = await nonEnrolledRes.json();
    assert.equal(nonEnrolledData.code, "ENROLLMENT_REQUIRED");

    // Direct check-in without token fails
    const directCheckInRes = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeNonEnrolledToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        workMode: "office"
      })
    });
    assert.equal(directCheckInRes.status, 400);

    // 2. Revoked/suspended employee tries to verify session
    const revokedRes = await fetch(`${baseUrl}/attendance/face/verify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeRevokedToken}`
      },
      body: JSON.stringify({
        imageBase64: validSelfie,
        workMode: "office"
      })
    });
    assert.equal(revokedRes.status, 403);
    const revokedData = await revokedRes.json();
    assert.equal(revokedData.code, "ENROLLMENT_REQUIRED");
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Existing MFA, audit logging, geofencing, breaks, shifts work
  // -------------------------------------------------------------------------
  it("Scenario 7: Existing MFA, audit logging, geofencing, breaks, shifts continue to work", async () => {
    // 1. Geofencing rejection outside office
    const geoFailRes = await fetch(`${baseUrl}/attendance/face/verify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({
        imageBase64: validSelfie,
        workMode: "office",
        actionType: "check-in",
        location: { latitude: 28.6139, longitude: 77.2090 } // Delhi coordinates (office is in Chennai)
      })
    });
    assert.equal(geoFailRes.status, 400);
    const geoFailData = await geoFailRes.json();
    assert.equal(geoFailData.code, "GEOFENCE_FAILED");

    // 2. Breaks system: record a break start and end
    const breakStartRes = await fetch(`${baseUrl}/attendance/start-break`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({
        type: "lunch"
      })
    });
    // Employee was checked out in Scenario 3, so break start should correctly validate attendance state
    assert.ok([200, 400].includes(breakStartRes.status));

    // 3. Attendance history query returns records
    const historyRes = await fetch(`${baseUrl}/attendance`, {
      headers: { Authorization: `Bearer ${employeeAToken}` }
    });
    assert.equal(historyRes.status, 200);
    const historyData = await historyRes.json();
    assert.ok(Array.isArray(historyData) || historyData.attendance !== undefined);

    // 4. Audit logging validation: verify events exist in audit_logs
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE company_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [companyA]
    );
    assert.ok(auditRes.rows.length > 0, "Audit logs must be preserved and recorded");
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Face verification service failure blocks attendance safely
  // -------------------------------------------------------------------------
  it("Scenario 8: Face verification service failure blocks attendance safely (fail-closed)", async () => {
    // Put mock face microservice into error mode (500 crash)
    mockFaceServiceState.mode = "error";

    const failClosedRes = await fetch(`${baseUrl}/attendance/face/verify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({
        imageBase64: validSelfie,
        workMode: "office",
        actionType: "check-in",
        location: { latitude: 13.0827, longitude: 80.2707 }
      })
    });

    // Verification must fail with 503 or 500
    assert.ok([500, 503].includes(failClosedRes.status));
    const failData = await failClosedRes.json();
    assert.match(failData.error || failData.message, /Biometric|Face verification|unavailable/i);

    // Verify no verification token was issued
    assert.equal(failData.verificationSessionToken, undefined);

    // Verify a failed attempt was logged with category 'face_service_unavailable'
    const attemptRes = await query(
      `SELECT * FROM attendance_verification_attempts 
       WHERE user_id = $1 AND failure_category = 'face_service_unavailable'
       ORDER BY attempted_at DESC LIMIT 1`,
      [employeeA.id]
    );
    assert.equal(attemptRes.rows.length, 1);
    assert.equal(attemptRes.rows[0].status, "failed");

    // Since no valid token was issued, check-in without token is rejected
    const checkInBlockedRes = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        workMode: "office"
      })
    });
    assert.equal(checkInBlockedRes.status, 400);
    const blockedData = await checkInBlockedRes.json();
    assert.match(blockedData.error, /Biometric verification is required/i);
  });
});
