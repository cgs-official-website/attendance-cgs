import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import app from "../app.js";
import { query } from "../config/db.js";
import * as emailService from "../services/emailService.js";

const JWT_SECRET = process.env.JWT_SECRET || "hrms_jwt_super_secret_railway_2026";

test("Multi-Factor Authentication (Email OTP with Resend) Test Suite", async (t) => {
  let server;
  let baseUrl;
  let dispatchedEmails = [];
  let simulateResendFailure = false;

  // Mock Resend dispatcher for automated tests
  emailService.setCustomOtpDispatcher(async ({ email, otp }) => {
    if (simulateResendFailure) {
      return { success: false, error: "Simulated Resend API delivery error" };
    }
    dispatchedEmails.push({ email, otp, timestamp: Date.now() });
    return { success: true, id: "resend_mock_" + crypto.randomUUID() };
  });

  const uniqueSuffix = Date.now();
  const testPassword = "Password123!@#";
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(testPassword, salt);

  const empEmail = `mfa_emp_${uniqueSuffix}@example.com`;
  const empId = `usr_emp_${uniqueSuffix}`;

  const adminEmail = `mfa_admin_${uniqueSuffix}@example.com`;
  const adminId = `usr_admin_${uniqueSuffix}`;

  let empPendingToken = null;
  let currentOtp = null;
  let verifiedEmpToken = null;

  // Start in-process test server
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api`;
      resolve();
    });
  });

  // Setup test users in database
  await query(
    `INSERT INTO users (id, email, password_hash, name, role, department, created_at)
     VALUES ($1, $2, $3, $4, 'employee', 'Engineering', NOW()),
            ($5, $6, $3, $7, 'admin', 'Management', NOW())`,
    [empId, empEmail, passwordHash, "MFA Test Employee", adminId, adminEmail, "MFA Test Admin"]
  );

  t.after(async () => {
    // Cleanup mock dispatcher, database records, and server
    emailService.setCustomOtpDispatcher(null);
    await query("DELETE FROM login_otps WHERE user_id IN ($1, $2)", [empId, adminId]).catch(() => {});
    await query("DELETE FROM users WHERE id IN ($1, $2)", [empId, adminId]).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  });

  await t.test("1. Invalid credentials reject without sending OTP", async () => {
    dispatchedEmails = [];
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: empEmail, password: "IncorrectPassword!" })
    });
    const data = await res.json();

    assert.strictEqual(res.status, 401);
    assert.ok(data.error.includes("Invalid password"));
    assert.strictEqual(data.token, undefined);
    assert.strictEqual(data.pendingToken, undefined);
    assert.strictEqual(dispatchedEmails.length, 0, "No OTP email must be dispatched for bad credentials");
  });

  await t.test("2. Resend email delivery failure prevents login and returns safe 500 error", async () => {
    simulateResendFailure = true;
    dispatchedEmails = [];

    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: empEmail, password: testPassword })
    });
    const data = await res.json();

    assert.strictEqual(res.status, 500);
    assert.ok(data.error.includes("Failed to deliver verification code"));
    assert.strictEqual(data.token, undefined);
    assert.strictEqual(data.mfaRequired, undefined);
    simulateResendFailure = false;
  });

  await t.test("3. Employee login with valid credentials initiates MFA and sends 6-digit OTP", async () => {
    dispatchedEmails = [];
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: empEmail, password: testPassword })
    });
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.mfaRequired, true);
    assert.ok(typeof data.pendingToken === "string" && data.pendingToken.length > 0);
    assert.strictEqual(data.token, undefined, "Must NOT issue authenticated access token before OTP");
    assert.strictEqual(data.email, empEmail);

    empPendingToken = data.pendingToken;

    // Verify dispatched email
    assert.strictEqual(dispatchedEmails.length, 1);
    assert.strictEqual(dispatchedEmails[0].email, empEmail);
    assert.ok(/^\d{6}$/.test(dispatchedEmails[0].otp), "OTP must be exactly 6 numeric digits");
    currentOtp = dispatchedEmails[0].otp;

    // Verify OTP was hashed in database (not stored plaintext)
    const dbRes = await query("SELECT * FROM login_otps WHERE user_id = $1 ORDER BY created_at DESC", [empId]);
    assert.ok(dbRes.rows.length >= 1);
    assert.notStrictEqual(dbRes.rows[0].otp_hash, currentOtp, "OTP must never be stored in plaintext");
    assert.strictEqual(dbRes.rows[0].is_used, false);
  });

  await t.test("4. Pending token cannot access protected HRMS endpoints (Fail-closed Access Control)", async () => {
    // Attempt to access protected /auth/me with pending token
    const resMe = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${empPendingToken}` }
    });
    assert.strictEqual(resMe.status, 401, "Protected route /auth/me must reject pending token with 401");

    // Attempt to access protected /attendance with pending token
    const resAtt = await fetch(`${baseUrl}/attendance`, {
      headers: { Authorization: `Bearer ${empPendingToken}` }
    });
    assert.strictEqual(resAtt.status, 401, "Protected route /attendance must reject pending token with 401");
  });

  await t.test("5. Invalid OTP is rejected with remaining attempt count", async () => {
    const wrongOtp = currentOtp === "123456" ? "654321" : "123456";
    const res = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken, otp: wrongOtp })
    });
    const data = await res.json();

    assert.strictEqual(res.status, 400);
    assert.ok(data.error.includes("Invalid verification code"));
    assert.strictEqual(data.token, undefined);
  });

  await t.test("6. Resend cooldown (60 seconds) is strictly enforced", async () => {
    const res = await fetch(`${baseUrl}/auth/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken })
    });
    const data = await res.json();

    assert.strictEqual(res.status, 429);
    assert.ok(data.error.includes("Please wait"));
  });

  await t.test("7. Resend OTP issues new code and invalidates previous OTP", async () => {
    const decoded = jwt.verify(empPendingToken, JWT_SECRET);
    // Simulate elapsed cooldown in database
    await query("UPDATE login_otps SET last_sent_at = NOW() - INTERVAL '65 seconds' WHERE id = $1", [decoded.pendingId]);

    dispatchedEmails = [];
    const res = await fetch(`${baseUrl}/auth/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken })
    });
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.ok(data.message.includes("sent to your email"));
    assert.strictEqual(dispatchedEmails.length, 1);

    const oldOtp = currentOtp;
    currentOtp = dispatchedEmails[0].otp;
    assert.notStrictEqual(currentOtp, oldOtp, "New distinct OTP must be generated");

    // Old OTP must now be rejected
    const oldVerifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken, otp: oldOtp })
    });
    assert.strictEqual(oldVerifyRes.status, 400, "Old replaced OTP must be invalidated and rejected");
  });

  await t.test("8. Expired OTP is rejected", async () => {
    const decoded = jwt.verify(empPendingToken, JWT_SECRET);
    // Simulate expired OTP (> 5 minutes ago)
    await query("UPDATE login_otps SET expires_at = NOW() - INTERVAL '10 seconds' WHERE id = $1", [decoded.pendingId]);

    const res = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken, otp: currentOtp })
    });
    const data = await res.json();

    assert.strictEqual(res.status, 400);
    assert.ok(data.error.toLowerCase().includes("expired"));
  });

  await t.test("9. Successful OTP verification grants authenticated access token", async () => {
    const decoded = jwt.verify(empPendingToken, JWT_SECRET);
    // Restore valid expiration
    await query("UPDATE login_otps SET expires_at = NOW() + INTERVAL '5 minutes', attempts = 0 WHERE id = $1", [decoded.pendingId]);

    const res = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken, otp: currentOtp })
    });
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.ok(typeof data.token === "string" && data.token.length > 0);
    assert.strictEqual(data.user?.email, empEmail);
    assert.strictEqual(data.user?.role, "employee");

    verifiedEmpToken = data.token;

    // Verify token can now access protected /auth/me
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${verifiedEmpToken}` }
    });
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.user?.id, empId);
  });

  await t.test("10. Reused OTP is rejected (Single-use protection)", async () => {
    const res = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken, otp: currentOtp })
    });
    const data = await res.json();

    assert.strictEqual(res.status, 400);
    assert.ok(data.error.includes("already been used"));
  });

  await t.test("11. Admin login requires mandatory Email OTP MFA", async () => {
    dispatchedEmails = [];
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: testPassword })
    });
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.mfaRequired, true, "Admin requires MFA challenge");
    assert.strictEqual(data.token, undefined, "Admin does NOT receive direct access token before OTP");
    assert.ok(typeof data.pendingToken === "string" && data.pendingToken.length > 0);

    // Verify admin OTP was dispatched
    assert.strictEqual(dispatchedEmails.length, 1);
    assert.strictEqual(dispatchedEmails[0].email, adminEmail);
    assert.ok(/^\d{6}$/.test(dispatchedEmails[0].otp));

    // Verify admin OTP verification grants full admin access
    const verifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: data.pendingToken, otp: dispatchedEmails[0].otp })
    });
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyRes.status, 200);
    assert.ok(typeof verifyData.token === "string" && verifyData.token.length > 0);
    assert.strictEqual(verifyData.user?.role, "admin");

    // Verify admin token accesses admin routes
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${verifyData.token}` }
    });
    assert.strictEqual(meRes.status, 200);
  });
});
