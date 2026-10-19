import { query } from "../src/config/db.js";
import sessionService from "../src/services/sessionService.js";
import auditService from "../src/services/auditService.js";
import securityDetector from "../src/services/securityDetector.js";

async function runTestSuite() {
  console.log("==================================================");
  console.log("🚀 STARTING AUDIT & SESSION MANAGEMENT TEST SUITE");
  console.log("==================================================");

  // 1. Get or create a test user
  const userRes = await query("SELECT id, email FROM users LIMIT 1");
  if (userRes.rows.length === 0) {
    throw new Error("No users found in database to test with.");
  }
  const testUser = userRes.rows[0];
  console.log(`👤 Using test user: ${testUser.email} (${testUser.id})`);

  // 2. Test Session Creation
  console.log("\n--- TEST 1: Create Session with Device Fingerprint ---");
  const mockReqA = {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
      "x-forwarded-for": "103.21.244.2"
    },
    ip: "103.21.244.2"
  };

  const sessionA = await sessionService.createSession(testUser.id, mockReqA);
  console.log("✅ Session A created:", {
    sessionId: sessionA.sessionId,
    device: sessionA.deviceInfo?.deviceName,
    ip: sessionA.ipAddress
  });

  // Verify session validity
  const validCheckA = await sessionService.validateSession(sessionA.sessionId);
  if (!validCheckA.valid) throw new Error("Session A should be valid!");
  console.log("✅ Session A is valid.");

  // 3. Test Session B Creation (Second Device)
  console.log("\n--- TEST 2: Create Second Session (Mobile Device) ---");
  const mockReqB = {
    headers: {
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
      "x-forwarded-for": "103.21.244.5"
    },
    ip: "103.21.244.5"
  };
  const sessionB = await sessionService.createSession(testUser.id, mockReqB);
  console.log("✅ Session B created:", {
    sessionId: sessionB.sessionId,
    device: sessionB.deviceInfo?.deviceName,
    ip: sessionB.ipAddress
  });

  // 4. Test Query Active Sessions
  console.log("\n--- TEST 3: Retrieve Active Sessions ---");
  const activeSessions = await sessionService.getUserActiveSessions(testUser.id, sessionA.sessionId);
  console.log(`✅ User has ${activeSessions.length} active session(s).`);
  const cur = activeSessions.find(s => s.sessionId === sessionA.sessionId);
  if (!cur || !cur.isCurrent) throw new Error("Session A should be marked as isCurrent!");
  console.log("✅ Current session correctly detected with device:", cur.deviceName);

  // 5. Test Session Revocation
  console.log("\n--- TEST 4: Revoke Session B remotely ---");
  const revokeResult = await sessionService.revokeSession(sessionB.sessionId, testUser.id, testUser.id, "Testing remote logout");
  if (!revokeResult) throw new Error("Revocation of Session B failed!");
  console.log("✅ Session B revoked successfully.");

  const validCheckB = await sessionService.validateSession(sessionB.sessionId);
  if (validCheckB.valid || validCheckB.code !== "SESSION_REVOKED") {
    throw new Error(`Session B should be revoked! Got: ${JSON.stringify(validCheckB)}`);
  }
  console.log("✅ Validating revoked Session B properly returns code: SESSION_REVOKED");

  // 6. Test Brute Force Detection
  console.log("\n--- TEST 5: Suspicious Brute Force Login Detection ---");
  const testAttackIp = "198.51.100.42";
  const testAttackEmail = `victim_${Date.now()}@example.com`;

  for (let i = 1; i <= 6; i++) {
    await securityDetector.recordFailedLogin(testAttackEmail, {
      headers: { "x-forwarded-for": testAttackIp, "user-agent": "Hydra-Brute-Force/1.0" },
      ip: testAttackIp
    });
  }

  // Check if security alert was recorded
  const alertsRes = await securityDetector.getSecurityAlerts({ limit: 5 });
  const bruteAlert = alertsRes.alerts.find(a => a.alert_type === "BRUTE_FORCE_ATTEMPT");
  if (!bruteAlert) {
    throw new Error("Brute force security alert was not triggered!");
  }
  console.log("✅ Brute force security alert successfully triggered and verified:", {
    type: bruteAlert.alert_type,
    severity: bruteAlert.severity,
    description: bruteAlert.description
  });

  // 7. Test Security Alert Resolution
  console.log("\n--- TEST 6: Resolve Security Alert ---");
  const resolved = await securityDetector.resolveAlert(bruteAlert.id);
  if (!resolved.is_resolved) throw new Error("Alert resolution failed!");
  console.log("✅ Security alert marked as resolved.");

  console.log("\n==================================================");
  console.log("🎉 ALL TESTS PASSED WITH 100% SUCCESS!");
  console.log("==================================================");
  process.exit(0);
}

runTestSuite().catch(err => {
  console.error("❌ Test suite encountered an error:", err);
  process.exit(1);
});
