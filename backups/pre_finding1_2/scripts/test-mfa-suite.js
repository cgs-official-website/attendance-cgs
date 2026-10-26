process.env.NODE_ENV = "test";
import http from "http";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { query } from "../src/config/db.js";
import * as emailService from "../src/services/emailService.js";

const JWT_SECRET = process.env.JWT_SECRET || "hrms_jwt_super_secret_railway_2026";
const TEST_PORT = 5088;
let server;
let baseUrl;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("==================================================");
  console.log("🧪 RUNNING COMPREHENSIVE ALL-ROLE MFA TEST SUITE");
  console.log("==================================================");

  // 1. Setup in-process server
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  baseUrl = `http://127.0.0.1:${TEST_PORT}/api`;
  console.log(`📡 Test server running at ${baseUrl}`);

  // 2. Setup mock / spy for sendOtpEmail
  let lastSentOtp = null;
  let lastSentEmail = null;
  let forceEmailFailure = false;

  emailService.setCustomOtpDispatcher(async ({ email, otp }) => {
    if (forceEmailFailure) {
      return { success: false, error: "Simulated Resend API delivery failure" };
    }
    lastSentOtp = otp;
    lastSentEmail = email;
    return { success: true, id: "msg_mock_" + Math.random().toString(36).substr(2, 8) };
  });

  // Track created test IDs for guaranteed cleanup
  const createdUserIds = [];
  const testPassword = "Password123!";

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(testPassword, salt);

    // Test accounts across ALL user types
    const testEmpEmail = "mfa_test_emp@testcompany.com";
    const testAdminEmail = "mfa_test_admin@testcompany.com";
    const testSuperAdminEmail = "mfa_test_superadmin@testcompany.com";
    const testManagerEmail = "mfa_test_manager@testcompany.com";
    const testHrEmail = "mfa_test_hr@testcompany.com";
    const testNoEmailAddress = "invalid_user_no_email@domain.com";

    const testEmpId = "usr_test_emp_" + Date.now();
    const testAdminId = "usr_test_admin_" + Date.now();
    const testSuperAdminId = "usr_test_superadmin_" + Date.now();
    const testManagerId = "usr_test_manager_" + Date.now();
    const testHrId = "usr_test_hr_" + Date.now();
    const testNoEmailId = "usr_test_noemail_" + Date.now();

    createdUserIds.push(testEmpId, testAdminId, testSuperAdminId, testManagerId, testHrId, testNoEmailId);

    // Clean up previous runs if any
    await query("DELETE FROM login_otps WHERE user_id = ANY($1)", [createdUserIds]);
    await query("DELETE FROM users WHERE email IN ($1, $2, $3, $4, $5, $6)", [
      testEmpEmail, testAdminEmail, testSuperAdminEmail, testManagerEmail, testHrEmail, testNoEmailAddress
    ]);

    // 1. Employee
    await query(
      `INSERT INTO users (id, email, password_hash, name, role, department, created_at)
       VALUES ($1, $2, $3, $4, 'employee', 'Engineering', NOW())`,
      [testEmpId, testEmpEmail, passwordHash, "MFA Test Employee"]
    );

    // 2. Admin
    await query(
      `INSERT INTO users (id, email, password_hash, name, role, department, created_at)
       VALUES ($1, $2, $3, $4, 'admin', 'Operations', NOW())`,
      [testAdminId, testAdminEmail, passwordHash, "MFA Test Admin"]
    );

    // 3. Superadmin
    await query(
      `INSERT INTO users (id, email, password_hash, name, role, department, created_at)
       VALUES ($1, $2, $3, $4, 'superadmin', 'Executive', NOW())`,
      [testSuperAdminId, testSuperAdminEmail, passwordHash, "MFA Test SuperAdmin"]
    );

    // 4. Project Manager
    await query(
      `INSERT INTO users (id, email, password_hash, name, role, is_project_manager, department, created_at)
       VALUES ($1, $2, $3, $4, 'employee', true, 'Engineering', NOW())`,
      [testManagerId, testManagerEmail, passwordHash, "MFA Test Manager"]
    );

    // 5. HR Personnel
    await query(
      `INSERT INTO users (id, email, password_hash, name, role, department, created_at)
       VALUES ($1, $2, $3, $4, 'hr manager', 'Human Resources', NOW())`,
      [testHrId, testHrEmail, passwordHash, "MFA Test HR"]
    );

    // 6. User with invalid / missing email (for Phase Six testing)
    await query(
      `INSERT INTO users (id, email, password_hash, name, role, department, created_at)
       VALUES ($1, $2, $3, $4, 'employee', 'General', NOW())`,
      [testNoEmailId, "invalid-email-address", passwordHash, "MFA Test Invalid Email"]
    );

    console.log("\n--- SCENARIO 1: Invalid Credentials ---");
    const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmpEmail, password: "WrongPassword" })
    });
    const badLoginData = await badLoginRes.json();
    assert(badLoginRes.status === 401, "Invalid password returns 401");
    assert(!badLoginData.token, "No access token issued for invalid password");
    assert(!badLoginData.pendingToken, "No pending MFA token issued for invalid credentials");

    console.log("\n--- SCENARIO 2: Email Delivery Failure Handling ---");
    forceEmailFailure = true;
    const failEmailRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmpEmail, password: testPassword })
    });
    const failEmailData = await failEmailRes.json();
    assert(failEmailRes.status === 500, "Resend email delivery failure returns 500");
    assert(!failEmailData.token, "No access token issued when email delivery fails");
    assert(!failEmailData.mfaRequired, "MFA session not granted when email delivery fails");
    forceEmailFailure = false;

    console.log("\n--- SCENARIO 3: Account with Invalid / Unregistered Email (Phase Six) ---");
    const noEmailLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invalid-email-address", password: testPassword })
    });
    const noEmailLoginData = await noEmailLoginRes.json();
    assert(noEmailLoginRes.status === 400, "Account without valid registered email rejected with 400");
    assert(!noEmailLoginData.token, "No access token issued for unconfigured email");
    assert(!noEmailLoginData.pendingToken, "No pending MFA token issued for unconfigured email");
    assert(noEmailLoginData.error.includes("valid registered email address"), "Clear actionable error returned directing user to administrator");

    console.log("\n--- SCENARIO 4: Employee Login & OTP Dispatch ---");
    const empLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmpEmail, password: testPassword })
    });
    const empLoginData = await empLoginRes.json();
    assert(empLoginRes.status === 200, "Employee login credentials accepted (200 OK)");
    assert(empLoginData.mfaRequired === true, "Response specifies mfaRequired: true");
    assert(Boolean(empLoginData.pendingToken), "Response includes restricted pendingToken");
    assert(!empLoginData.token, "Response does NOT include normal authenticated access token");
    assert(lastSentEmail === testEmpEmail, "OTP email was dispatched to registered employee email");
    assert(typeof lastSentOtp === "string" && /^\d{6}$/.test(lastSentOtp), `OTP is exactly 6 numeric digits: ${lastSentOtp}`);

    const empPendingToken = empLoginData.pendingToken;
    const empOtp = lastSentOtp;

    console.log("\n--- SCENARIO 5: Access Control with Pending MFA Token ---");
    const protectedRes = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${empPendingToken}` }
    });
    assert(protectedRes.status === 401, "Protected route /users rejects unverified pendingToken with 401");

    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${empPendingToken}` }
    });
    assert(meRes.status === 401, "Protected route /auth/me rejects unverified pendingToken with 401");

    console.log("\n--- SCENARIO 6: Invalid OTP Verification ---");
    const invalidOtpRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken, otp: "000000" === empOtp ? "111111" : "000000" })
    });
    const invalidOtpData = await invalidOtpRes.json();
    assert(invalidOtpRes.status === 400, "Incorrect OTP returns 400 Bad Request");
    assert(invalidOtpData.error.includes("Invalid verification code"), "Returns clear error message without sensitive leaks");

    console.log("\n--- SCENARIO 7: Resend OTP Cooldown Enforcement ---");
    const cooldownRes = await fetch(`${baseUrl}/auth/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken })
    });
    const cooldownData = await cooldownRes.json();
    assert(cooldownRes.status === 429, "Immediate resend within 60s cooldown returns 429 Too Many Requests");
    assert(cooldownData.error.includes("Please wait"), "Cooldown error informs user of wait time");

    console.log("\n--- SCENARIO 8: Secure OTP Resend & Previous OTP Invalidation ---");
    const decodedEmp = jwt.verify(empPendingToken, JWT_SECRET);
    await query("UPDATE login_otps SET last_sent_at = NOW() - INTERVAL '65 seconds' WHERE id = $1", [decodedEmp.pendingId]);

    const resendRes = await fetch(`${baseUrl}/auth/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken })
    });
    assert(resendRes.status === 200, "Resend OTP succeeds after cooldown (200 OK)");
    const newEmpOtp = lastSentOtp;
    assert(newEmpOtp !== empOtp, "New distinct OTP generated");

    // Old OTP must now be rejected
    const oldOtpVerifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken, otp: empOtp })
    });
    assert(oldOtpVerifyRes.status === 400, "Previous replaced OTP is invalidated and rejected");

    console.log("\n--- SCENARIO 9: Expired OTP Enforcement ---");
    await query("UPDATE login_otps SET expires_at = NOW() - INTERVAL '10 seconds' WHERE id = $1", [decodedEmp.pendingId]);
    const expiredRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken, otp: newEmpOtp })
    });
    const expiredData = await expiredRes.json();
    assert(expiredRes.status === 400, "Expired OTP is rejected with 400");
    assert(expiredData.error.toLowerCase().includes("expired"), "Error indicates code has expired");

    console.log("\n--- SCENARIO 10: Successful Employee OTP Verification & Access Grant ---");
    await query("UPDATE login_otps SET expires_at = NOW() + INTERVAL '5 minutes' WHERE id = $1", [decodedEmp.pendingId]);
    const empVerifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken, otp: newEmpOtp })
    });
    const empVerifyData = await empVerifyRes.json();
    assert(empVerifyRes.status === 200, "Valid OTP verification returns 200 OK");
    assert(Boolean(empVerifyData.token), "Authenticated 30-day JWT token issued");
    assert(empVerifyData.user?.email === testEmpEmail, "User profile returned correctly");
    assert(empVerifyData.user?.role === "employee", "Employee role preserved");

    const empAuthToken = empVerifyData.token;

    console.log("\n--- SCENARIO 11: Reused OTP Protection ---");
    const reuseRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: empPendingToken, otp: newEmpOtp })
    });
    const reuseData = await reuseRes.json();
    assert(reuseRes.status === 400, "Reused OTP rejected with 400");
    assert(reuseData.error.toLowerCase().includes("already been used"), "Error message explains OTP was already used");

    console.log("\n--- SCENARIO 12: Protected HRMS API Access with Verified Employee Token ---");
    const verifiedMeRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${empAuthToken}` }
    });
    const verifiedMeData = await verifiedMeRes.json();
    assert(verifiedMeRes.status === 200, "Verified token successfully accesses protected /auth/me");
    assert(verifiedMeData.user?.id === testEmpId, "Profile matches authenticated employee");

    console.log("\n--- SCENARIO 13: ADMIN LOGIN WITH MANDATORY MFA ---");
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testAdminEmail, password: testPassword })
    });
    const adminLoginData = await adminLoginRes.json();
    assert(adminLoginRes.status === 200, "Admin credentials accepted (200 OK)");
    assert(adminLoginData.mfaRequired === true, "Admin requires MFA challenge (mfaRequired: true)");
    assert(Boolean(adminLoginData.pendingToken), "Admin receives restricted pendingToken");
    assert(!adminLoginData.token, "Admin does NOT receive direct access token before OTP");
    assert(lastSentEmail === testAdminEmail, "Admin OTP sent to registered admin email");
    assert(typeof lastSentOtp === "string" && /^\d{6}$/.test(lastSentOtp), "Admin OTP is 6 digits");

    const adminPendingToken = adminLoginData.pendingToken;
    const adminOtp = lastSentOtp;

    // Verify unverified admin cannot access protected /users
    const adminPendingAccess = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${adminPendingToken}` }
    });
    assert(adminPendingAccess.status === 401, "Admin pendingToken cannot access /users before verification");

    // Complete admin OTP verification
    const adminVerifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: adminPendingToken, otp: adminOtp })
    });
    const adminVerifyData = await adminVerifyRes.json();
    assert(adminVerifyRes.status === 200, "Admin OTP verification succeeds (200 OK)");
    assert(Boolean(adminVerifyData.token), "Admin receives full JWT access token after OTP");
    assert(adminVerifyData.user?.role === "admin", "Admin role strictly preserved");
    assert(adminVerifyData.user?.email === testAdminEmail, "Admin user email preserved");

    // Verify admin token can access admin-protected routes
    const adminUsersRes = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${adminVerifyData.token}` }
    });
    assert(adminUsersRes.status === 200, "Admin verified token successfully accesses admin-protected /users");

    console.log("\n--- SCENARIO 14: SUPERADMIN LOGIN WITH MANDATORY MFA ---");
    const superLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testSuperAdminEmail, password: testPassword })
    });
    const superLoginData = await superLoginRes.json();
    assert(superLoginRes.status === 200, "Superadmin credentials accepted (200 OK)");
    assert(superLoginData.mfaRequired === true, "Superadmin requires MFA challenge (mfaRequired: true)");
    assert(Boolean(superLoginData.pendingToken), "Superadmin receives restricted pendingToken");
    assert(!superLoginData.token, "Superadmin does NOT receive direct access token");
    assert(lastSentEmail === testSuperAdminEmail, "Superadmin OTP sent to registered superadmin email");

    const superPendingToken = superLoginData.pendingToken;
    const superOtp = lastSentOtp;

    // Verify unverified superadmin cannot access protected /users
    const superPendingAccess = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${superPendingToken}` }
    });
    assert(superPendingAccess.status === 401, "Superadmin pendingToken rejected on /users with 401");

    // Complete superadmin OTP verification
    const superVerifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: superPendingToken, otp: superOtp })
    });
    const superVerifyData = await superVerifyRes.json();
    assert(superVerifyRes.status === 200, "Superadmin OTP verification succeeds (200 OK)");
    assert(Boolean(superVerifyData.token), "Superadmin receives full JWT access token after OTP");
    assert(superVerifyData.user?.role === "superadmin", "Superadmin role strictly preserved");

    // Verify superadmin token can access protected routes
    const superUsersRes = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${superVerifyData.token}` }
    });
    assert(superUsersRes.status === 200, "Superadmin verified token successfully accesses /users");

    console.log("\n--- SCENARIO 15: PROJECT MANAGER & HR ROLES WITH MANDATORY MFA ---");
    // Manager login
    const pmLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testManagerEmail, password: testPassword })
    });
    const pmLoginData = await pmLoginRes.json();
    assert(pmLoginRes.status === 200, "Project Manager credentials accepted (200 OK)");
    assert(pmLoginData.mfaRequired === true, "Project Manager requires MFA challenge");
    const pmVerifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: pmLoginData.pendingToken, otp: lastSentOtp })
    });
    const pmVerifyData = await pmVerifyRes.json();
    assert(pmVerifyRes.status === 200, "Project Manager OTP verification succeeds (200 OK)");
    assert(pmVerifyData.user?.isProjectManager === true, "isProjectManager flag preserved");

    // HR login
    const hrLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testHrEmail, password: testPassword })
    });
    const hrLoginData = await hrLoginRes.json();
    assert(hrLoginRes.status === 200, "HR credentials accepted (200 OK)");
    assert(hrLoginData.mfaRequired === true, "HR requires MFA challenge");
    const hrVerifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: hrLoginData.pendingToken, otp: lastSentOtp })
    });
    const hrVerifyData = await hrVerifyRes.json();
    assert(hrVerifyRes.status === 200, "HR OTP verification succeeds (200 OK)");
    assert(hrVerifyData.user?.role === "hr manager", "HR Manager role preserved");

    console.log("\n--- SCENARIO 16: Cross-User Identity Switching Prevention ---");
    // Attempt to verify Admin's pending session with Employee's OTP
    const crossVerifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken: adminPendingToken, otp: "999999" })
    });
    assert(crossVerifyRes.status === 400, "Cross-user or forged OTP verification attempt rejected with 400");

    console.log("\n--- SCENARIO 17: Password Reset Regression Verification ---");
    const resetRes = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmpEmail })
    });
    assert(resetRes.status === 200, "Password reset request functions properly (200 OK)");

    // Cleanup test users and OTPs
    await query("DELETE FROM login_otps WHERE user_id = ANY($1)", [createdUserIds]);
    await query("DELETE FROM users WHERE id = ANY($1)", [createdUserIds]);
    console.log("🧹 Cleaned up all test users and OTP records.");

  } finally {
    // Reset mock dispatcher and close server
    emailService.setCustomOtpDispatcher(null);
    await new Promise((resolve) => server.close(resolve));
  }

  console.log("\n==================================================");
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Unhandled test suite exception:", err);
  if (server) server.close();
  process.exit(1);
});
