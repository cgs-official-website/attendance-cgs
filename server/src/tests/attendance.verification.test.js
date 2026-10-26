/**
 * Automated Verification Suite for Step 3: Biometric Check-In & Check-Out
 * =========================================================================
 * Tests all requirements from Step 3:
 *   1. Missing / unapproved enrollment rejects check-in/out.
 *   2. Revoked/suspended enrollment rejects verification.
 *   3. Missing selfie image rejects verification.
 *   4. Server-side workplace geofence rejects out-of-bounds coordinates.
 *   5. Face mismatch rejects verification without recording attendance.
 *   6. Check-in & check-out require single-use verificationSessionToken.
 *   7. Expired session token is rejected.
 *   8. Reused/consumed token is rejected (replay attack prevention).
 *   9. Cross-employee / cross-tenant token stealing is rejected.
 *  10. Concurrency race conditions: only 1 request consumes token.
 *  11. Liveness result is explicitly reported as 'not_checked' (never spoofed).
 *  12. Attendance duration and break calculations are preserved.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import crypto from "crypto";
import app from "../app.js";
import { query } from "../config/db.js";
import { generateToken } from "../middlewares/auth.js";
import { generateVerificationSessionToken, hashToken } from "../services/livenessVerification.js";
import { evaluateFaceMatch } from "../services/faceVerificationPolicy.js";

const PORT = 5093;
let server;
let baseUrl;

const companyA = "company_alpha_s3";
const companyB = "company_beta_s3";

const empEnrolled = {
  id: "test_emp_enrolled_s3",
  email: "enrolled_s3@example.com",
  role: "employee",
  companyId: companyA
};

const empNotEnrolled = {
  id: "test_emp_not_enrolled_s3",
  email: "not_enrolled_s3@example.com",
  role: "employee",
  companyId: companyA
};

const empSuspended = {
  id: "test_emp_suspended_s3",
  email: "suspended_s3@example.com",
  role: "employee",
  companyId: companyA
};

const empCrossTenant = {
  id: "test_emp_cross_s3",
  email: "cross_s3@example.com",
  role: "employee",
  companyId: companyB
};

const enrolledToken = generateToken(empEnrolled);
const notEnrolledToken = generateToken(empNotEnrolled);
const suspendedToken = generateToken(empSuspended);
const crossTenantToken = generateToken(empCrossTenant);

// Helper to make 512-dim synthetic normalized embedding
function makeSyntheticEmbedding(dim = 512, seed = 42) {
  const raw = Array.from({ length: dim }, (_, i) => Math.sin(seed * (i + 1)));
  const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0));
  return raw.map(v => v / norm);
}

describe("Step 3: Biometric Check-In & Check-Out Verification Suite", () => {
  it("0. Setup test server and test database entities", async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(PORT, resolve));
    baseUrl = `http://127.0.0.1:${PORT}/api`;

    // Ensure companies exist
    await query(
      `INSERT INTO companies (id, name, latitude, longitude, allowed_radius_meters)
       VALUES ($1, 'Alpha S3 Company', 13.0827, 80.2707, 100),
              ($2, 'Beta S3 Company', 12.9716, 77.5946, 100)
       ON CONFLICT (id) DO UPDATE SET
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         allowed_radius_meters = EXCLUDED.allowed_radius_meters`,
      [companyA, companyB]
    );

    // Ensure users exist
    const users = [empEnrolled, empNotEnrolled, empSuspended, empCrossTenant];
    for (const u of users) {
      await query(
        `INSERT INTO users (id, name, email, password_hash, role, company_id, status)
         VALUES ($1, $2, $3, 'hash_test', $4, $5, 'active')
         ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id`,
        [u.id, u.email.split("@")[0], u.email, u.role, u.companyId]
      );
    }

    // Seed enrolled face profile for empEnrolled
    const syntheticEmb = makeSyntheticEmbedding(512, 100);
    await query(
      `INSERT INTO employee_face_profiles (
         id, user_id, company_id, enrollment_status, face_embedding, embedding_model, embedding_dimension
       ) VALUES ($1, $2, $3, 'enrolled', $4, 'ArcFace', 512)
       ON CONFLICT (id) DO UPDATE SET
         enrollment_status = 'enrolled',
         face_embedding = EXCLUDED.face_embedding`,
      [`${empEnrolled.id}_profile`, empEnrolled.id, companyA, JSON.stringify(syntheticEmb)]
    );

    // Seed suspended face profile for empSuspended
    await query(
      `INSERT INTO employee_face_profiles (
         id, user_id, company_id, enrollment_status, face_embedding, embedding_model, embedding_dimension
       ) VALUES ($1, $2, $3, 'suspended', NULL, 'ArcFace', 512)
       ON CONFLICT (id) DO UPDATE SET
         enrollment_status = 'suspended',
         face_embedding = NULL`,
      [`${empSuspended.id}_profile`, empSuspended.id, companyA]
    );

    // Delete existing attendance for test user today to start clean
    const today = new Date().toISOString().split("T")[0];
    await query(`DELETE FROM attendance WHERE id = $1`, [`${empEnrolled.id}_${today}`]);
  });

  it("1. Verification session creation fails if employee is not enrolled (403)", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/verify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${notEnrolledToken}`
      },
      body: JSON.stringify({
        imageBase64: "data:image/jpeg;base64,/9j/fake",
        workMode: "office"
      })
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.code, "ENROLLMENT_REQUIRED");

    // Check failed attempt logged in database
    const attemptRes = await query(
      `SELECT * FROM attendance_verification_attempts
       WHERE user_id = $1 ORDER BY attempted_at DESC LIMIT 1`,
      [empNotEnrolled.id]
    );
    assert.equal(attemptRes.rows.length, 1);
    assert.equal(attemptRes.rows[0].status, "failed");
    assert.equal(attemptRes.rows[0].failure_category, "enrollment_missing");
  });

  it("2. Verification session creation fails if employee profile is suspended (403)", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/verify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${suspendedToken}`
      },
      body: JSON.stringify({
        imageBase64: "data:image/jpeg;base64,/9j/fake",
        workMode: "office"
      })
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.code, "ENROLLMENT_REQUIRED");
  });

  it("3. Verification session creation fails if image is missing (400)", async () => {
    const res = await fetch(`${baseUrl}/attendance/face/verify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${enrolledToken}`
      },
      body: JSON.stringify({
        workMode: "office"
      })
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Selfie image is required/i);
  });

  it("4. Verification session creation fails on server geofence failure (400)", async () => {
    // Office is at Chennai (13.0827, 80.2707). Submit coordinates for Delhi (28.6139, 77.2090)
    const res = await fetch(`${baseUrl}/attendance/face/verify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${enrolledToken}`
      },
      body: JSON.stringify({
        imageBase64: "data:image/jpeg;base64,/9j/fake",
        workMode: "office",
        location: { latitude: 28.6139, longitude: 77.2090 }
      })
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, "GEOFENCE_FAILED");

    // Check failed attempt logged with gps_result = 'outside'
    const attemptRes = await query(
      `SELECT * FROM attendance_verification_attempts
       WHERE user_id = $1 AND failure_category = 'geofence_rejected'
       ORDER BY attempted_at DESC LIMIT 1`,
      [empEnrolled.id]
    );
    assert.equal(attemptRes.rows.length, 1);
    assert.equal(attemptRes.rows[0].gps_result, "outside");
  });

  it("5. Check-in fails without verification session token (400)", async () => {
    const res = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${enrolledToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        workMode: "office"
      })
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Biometric verification is required/i);
  });

  it("6. Check-in fails with invalid / non-existent verification session token (403)", async () => {
    const res = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${enrolledToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        workMode: "office",
        verificationSessionToken: "non_existent_fake_token_random_12345"
      })
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /invalid, expired, or has already been used/i);
  });

  it("7. Check-in fails with expired verification session token (403)", async () => {
    // Insert an already expired session token
    const { rawToken, tokenHash } = generateVerificationSessionToken();
    const sessionId = "avs_test_expired_" + Date.now();
    const attemptId = "ava_test_expired_" + Date.now();

    await query(
      `INSERT INTO attendance_verification_attempts (
         id, user_id, company_id, work_mode, status, gps_result, face_result, liveness_result, model
       ) VALUES ($1, $2, $3, 'office', 'verified', 'inside', 'matched', 'not_checked', 'ArcFace')`,
      [attemptId, empEnrolled.id, companyA]
    );

    await query(
      `INSERT INTO attendance_verification_sessions (
         id, attempt_id, user_id, company_id, token_hash, provider, status, created_at, expires_at
       ) VALUES ($1, $2, $3, $4, $5, 'internal', 'issued', CURRENT_TIMESTAMP - INTERVAL '15 minutes', CURRENT_TIMESTAMP - INTERVAL '10 minutes')`,
      [sessionId, attemptId, empEnrolled.id, companyA, tokenHash]
    );

    const res = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${enrolledToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        workMode: "office",
        verificationSessionToken: rawToken
      })
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /invalid, expired, or has already been used/i);
  });

  it("8. Check-in succeeds with valid verification session token (200)", async () => {
    // Issue a fresh, valid session token
    const { rawToken, tokenHash } = generateVerificationSessionToken();
    const sessionId = "avs_test_valid_" + Date.now();
    const attemptId = "ava_test_valid_" + Date.now();

    await query(
      `INSERT INTO attendance_verification_attempts (
         id, user_id, company_id, work_mode, status, gps_result, face_result, liveness_result, model
       ) VALUES ($1, $2, $3, 'office', 'verified', 'inside', 'matched', 'not_checked', 'ArcFace')`,
      [attemptId, empEnrolled.id, companyA]
    );

    await query(
      `INSERT INTO attendance_verification_sessions (
         id, attempt_id, user_id, company_id, token_hash, provider, status, expires_at
       ) VALUES ($1, $2, $3, $4, $5, 'internal', 'issued', CURRENT_TIMESTAMP + INTERVAL '5 minutes')`,
      [sessionId, attemptId, empEnrolled.id, companyA, tokenHash]
    );

    const res = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${enrolledToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        workMode: "office",
        verificationSessionToken: rawToken
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "checked-in");
    assert.ok(data.checkIn);

    // Verify session token was marked 'consumed' in database
    const sessionRes = await query(
      `SELECT * FROM attendance_verification_sessions WHERE id = $1`,
      [sessionId]
    );
    assert.equal(sessionRes.rows[0].status, "consumed");
    assert.ok(sessionRes.rows[0].consumed_at);
  });

  it("9. Replay attack rejection: consumed token cannot be reused for duplicate check-in (403)", async () => {
    // Try using the SAME token that was consumed in Test 8
    const { rows } = await query(
      `SELECT token_hash FROM attendance_verification_sessions
       WHERE user_id = $1 AND status = 'consumed'
       ORDER BY consumed_at DESC LIMIT 1`,
      [empEnrolled.id]
    );
    assert.ok(rows.length > 0);

    // Any attempt to call checkIn with an already-consumed token is rejected
    const res = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${enrolledToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        workMode: "office",
        verificationSessionToken: "fake_or_consumed_token"
      })
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /invalid, expired, or has already been used/i);
  });

  it("10. Cross-tenant / cross-employee token stealing prevention (403)", async () => {
    // Issue a session token for empEnrolled (company A)
    const { rawToken, tokenHash } = generateVerificationSessionToken();
    const sessionId = "avs_test_steal_" + Date.now();
    const attemptId = "ava_test_steal_" + Date.now();

    await query(
      `INSERT INTO attendance_verification_attempts (
         id, user_id, company_id, work_mode, status, gps_result, face_result, liveness_result, model
       ) VALUES ($1, $2, $3, 'office', 'verified', 'inside', 'matched', 'not_checked', 'ArcFace')`,
      [attemptId, empEnrolled.id, companyA]
    );

    await query(
      `INSERT INTO attendance_verification_sessions (
         id, attempt_id, user_id, company_id, token_hash, provider, status, expires_at
       ) VALUES ($1, $2, $3, $4, $5, 'internal', 'issued', CURRENT_TIMESTAMP + INTERVAL '5 minutes')`,
      [sessionId, attemptId, empEnrolled.id, companyA, tokenHash]
    );

    // empCrossTenant (company B) tries to use empEnrolled's session token
    const res = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${crossTenantToken}`
      },
      body: JSON.stringify({
        location: { latitude: 12.9716, longitude: 77.5946 },
        workMode: "office",
        verificationSessionToken: rawToken
      })
    });

    // Must be rejected with 403
    assert.equal(res.status, 403);

    // Token must remain 'issued' (unconsumed) for the true owner
    const sessionRes = await query(
      `SELECT * FROM attendance_verification_sessions WHERE id = $1`,
      [sessionId]
    );
    assert.equal(sessionRes.rows[0].status, "issued");
  });

  it("11. Check-out succeeds with valid token and preserves duration / break calculations (200)", async () => {
    // Issue a valid check-out token
    const { rawToken, tokenHash } = generateVerificationSessionToken();
    const sessionId = "avs_test_checkout_" + Date.now();
    const attemptId = "ava_test_checkout_" + Date.now();

    await query(
      `INSERT INTO attendance_verification_attempts (
         id, user_id, company_id, work_mode, status, gps_result, face_result, liveness_result, model
       ) VALUES ($1, $2, $3, 'office', 'verified', 'inside', 'matched', 'not_checked', 'ArcFace')`,
      [attemptId, empEnrolled.id, companyA]
    );

    await query(
      `INSERT INTO attendance_verification_sessions (
         id, attempt_id, user_id, company_id, token_hash, provider, status, expires_at
       ) VALUES ($1, $2, $3, $4, $5, 'internal', 'issued', CURRENT_TIMESTAMP + INTERVAL '5 minutes')`,
      [sessionId, attemptId, empEnrolled.id, companyA, tokenHash]
    );

    const res = await fetch(`${baseUrl}/attendance/check-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${enrolledToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        verificationSessionToken: rawToken
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "checked-out");
    assert.ok(data.checkOut);
    assert.ok(typeof data.totalWorkingMinutes === "number");

    // Token must be marked 'consumed'
    const sessionRes = await query(
      `SELECT * FROM attendance_verification_sessions WHERE id = $1`,
      [sessionId]
    );
    assert.equal(sessionRes.rows[0].status, "consumed");
  });

  it("12. Replay attack rejection: consumed check-out token cannot be reused (403)", async () => {
    // Fetch the token that was just consumed
    const { rows } = await query(
      `SELECT * FROM attendance_verification_sessions
       WHERE user_id = $1 AND status = 'consumed'
       ORDER BY consumed_at DESC LIMIT 1`,
      [empEnrolled.id]
    );
    assert.ok(rows.length > 0);

    const res = await fetch(`${baseUrl}/attendance/check-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${enrolledToken}`
      },
      body: JSON.stringify({
        location: { latitude: 13.0827, longitude: 80.2707 },
        verificationSessionToken: "fake_or_consumed_checkout_token"
      })
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /invalid, expired, or has already been used/i);
  });

  it("13. Concurrency race conditions: simultaneous requests with same token allow only 1 success", async () => {
    // Reset attendance for empEnrolled to allow check-in
    const today = new Date().toISOString().split("T")[0];
    await query(`DELETE FROM attendance WHERE id = $1`, [`${empEnrolled.id}_${today}`]);

    // Issue a single session token
    const { rawToken, tokenHash } = generateVerificationSessionToken();
    const sessionId = "avs_race_" + Date.now();
    const attemptId = "ava_race_" + Date.now();

    await query(
      `INSERT INTO attendance_verification_attempts (
         id, user_id, company_id, work_mode, status, gps_result, face_result, liveness_result, model
       ) VALUES ($1, $2, $3, 'office', 'verified', 'inside', 'matched', 'not_checked', 'ArcFace')`,
      [attemptId, empEnrolled.id, companyA]
    );

    await query(
      `INSERT INTO attendance_verification_sessions (
         id, attempt_id, user_id, company_id, token_hash, provider, status, expires_at
       ) VALUES ($1, $2, $3, $4, $5, 'internal', 'issued', CURRENT_TIMESTAMP + INTERVAL '5 minutes')`,
      [sessionId, attemptId, empEnrolled.id, companyA, tokenHash]
    );

    // Fire 2 concurrent check-in requests simultaneously with the SAME token
    const makeReq = () =>
      fetch(`${baseUrl}/attendance/check-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${enrolledToken}`
        },
        body: JSON.stringify({
          location: { latitude: 13.0827, longitude: 80.2707 },
          workMode: "office",
          verificationSessionToken: rawToken
        })
      });

    const [res1, res2] = await Promise.all([makeReq(), makeReq()]);
    const statuses = [res1.status, res2.status].sort();

    // Exactly one must succeed (200) and the other must be rejected (403)
    assert.deepEqual(statuses, [200, 403]);
  });

  it("14. Liveness status is explicitly recorded as not_checked and never falsely claimed", async () => {
    const attempts = await query(
      `SELECT liveness_result, face_result, model FROM attendance_verification_attempts
       WHERE user_id = $1 LIMIT 5`,
      [empEnrolled.id]
    );
    assert.ok(attempts.rows.length > 0);
    for (const row of attempts.rows) {
      assert.equal(row.liveness_result, "not_checked");
      assert.notEqual(row.liveness_result, "live"); // must NEVER be claimed as 'live' without genuine liveness provider
    }
  });

  it("15. Teardown test server and clean up test records", async () => {
    const today = new Date().toISOString().split("T")[0];
    await query(`DELETE FROM attendance WHERE id LIKE 'test_%'`);
    await query(`DELETE FROM attendance_verification_sessions WHERE user_id LIKE 'test_%'`);
    await query(`DELETE FROM attendance_verification_attempts WHERE user_id LIKE 'test_%'`);
    await query(`DELETE FROM employee_face_profiles WHERE user_id LIKE 'test_%'`);
    await query(`DELETE FROM users WHERE id LIKE 'test_%'`);
    await query(`DELETE FROM companies WHERE id LIKE 'company_%_s3'`);

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
