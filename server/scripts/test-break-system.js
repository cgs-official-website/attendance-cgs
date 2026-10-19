import { query } from "../src/config/db.js";
import auditService from "../src/services/auditService.js";
import * as attendanceController from "../src/controllers/attendanceController.js";

async function testBreakSystem() {
  console.log("==================================================");
  console.log("☕ TESTING 3-BREAK LIMIT, RESUME REMOVAL & AUDIT LOGS");
  console.log("==================================================");

  // 1. Get a test user
  const uRes = await query("SELECT id, email, company_id FROM users LIMIT 1");
  const user = uRes.rows[0];
  const testDate = "2099-01-01"; // Future date to not interfere with real records
  const recordId = `${user.id}_${testDate}`;

  console.log(`👤 Using user: ${user.email} on test date: ${testDate}`);

  // Clean any existing test record
  await query("DELETE FROM attendance WHERE id = $1", [recordId]);

  // Create helper to mock Express req & res
  const mockReqRes = (body, userObj) => {
    let statusCode = 200;
    let responseData = null;
    const req = {
      body,
      user: userObj,
      ip: "127.0.0.1",
      headers: { "user-agent": "Automated Break Tester" }
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };
    return { req, res, getStatus: () => statusCode, getData: () => responseData };
  };

  // Step 1: Check in
  console.log("\n--- STEP 1: Check in ---");
  const checkInMock = mockReqRes({ date: testDate }, { id: user.id, companyId: user.company_id });
  await attendanceController.checkIn(checkInMock.req, checkInMock.res);
  console.log(`✅ Checked in successfully (Status: ${checkInMock.getStatus()})`);

  // Step 2: Start Break 1
  console.log("\n--- STEP 2: Start Break 1 (short) ---");
  const break1StartMock = mockReqRes({ date: testDate, breakType: "short" }, { id: user.id });
  await attendanceController.startBreak(break1StartMock.req, break1StartMock.res);
  if (break1StartMock.getStatus() !== 200) {
    throw new Error(`Failed to start Break 1: ${JSON.stringify(break1StartMock.getData())}`);
  }
  console.log("✅ Break 1 started successfully.");

  // Step 3: Resume Break 1
  console.log("\n--- STEP 3: Resume Break 1 ---");
  const break1EndMock = mockReqRes({ date: testDate }, { id: user.id });
  await attendanceController.endBreak(break1EndMock.req, break1EndMock.res);
  if (break1EndMock.getStatus() !== 200) {
    throw new Error(`Failed to end Break 1: ${JSON.stringify(break1EndMock.getData())}`);
  }
  console.log("✅ Break 1 resumed successfully.");

  // Step 4: Attempt to re-take Break 1 (Should be rejected because it was resumed and removed from the system)
  console.log("\n--- STEP 4: Attempt to reuse Break 1 (Should be rejected) ---");
  const break1ReuseMock = mockReqRes({ date: testDate, breakType: "short" }, { id: user.id });
  await attendanceController.startBreak(break1ReuseMock.req, break1ReuseMock.res);
  if (break1ReuseMock.getStatus() !== 400) {
    throw new Error("Break 1 should have been rejected for reuse!");
  }
  console.log(`✅ Break 1 reuse correctly rejected with message: "${break1ReuseMock.getData().error}"`);

  // Step 5: Start & Resume Break 2
  console.log("\n--- STEP 5: Start & Resume Break 2 (long) ---");
  const break2Start = mockReqRes({ date: testDate, breakType: "long" }, { id: user.id });
  await attendanceController.startBreak(break2Start.req, break2Start.res);
  const break2End = mockReqRes({ date: testDate }, { id: user.id });
  await attendanceController.endBreak(break2End.req, break2End.res);
  console.log("✅ Break 2 started and resumed successfully.");

  // Step 6: Start & Resume Break 3
  console.log("\n--- STEP 6: Start & Resume Break 3 (bio) ---");
  const break3Start = mockReqRes({ date: testDate, breakType: "bio" }, { id: user.id });
  await attendanceController.startBreak(break3Start.req, break3Start.res);
  const break3End = mockReqRes({ date: testDate }, { id: user.id });
  await attendanceController.endBreak(break3End.req, break3End.res);
  console.log("✅ Break 3 started and resumed successfully (Total 3 breaks used).");

  // Step 7: Attempt to take a 4th break (Should be rejected because 3-break limit is reached)
  console.log("\n--- STEP 7: Attempt 4th break (Should exceed limit) ---");
  const break4Mock = mockReqRes({ date: testDate, breakType: "custom" }, { id: user.id });
  await attendanceController.startBreak(break4Mock.req, break4Mock.res);
  if (break4Mock.getStatus() !== 400) {
    throw new Error("4th break should have been blocked!");
  }
  console.log(`✅ 4th break correctly blocked with message: "${break4Mock.getData().error}"`);

  // Step 8: Verify Audit Logs
  console.log("\n--- STEP 8: Verify Audit Logs recorded break events ---");
  // Give async logging a tick
  await new Promise(r => setTimeout(r, 600));

  const logsRes = await auditService.getAuditLogs({ limit: 10, userId: user.id });
  const breakStartLog = logsRes.logs.find(l => l.action === "ATTENDANCE_BREAK_START");
  const breakResumeLog = logsRes.logs.find(l => l.action === "ATTENDANCE_BREAK_RESUME");

  if (!breakStartLog || !breakResumeLog) {
    throw new Error("Break start or resume audit logs were not found in audit_logs!");
  }

  console.log("✅ Found ATTENDANCE_BREAK_START audit log:", {
    action: breakStartLog.action,
    details: breakStartLog.details
  });
  console.log("✅ Found ATTENDANCE_BREAK_RESUME audit log:", {
    action: breakResumeLog.action,
    details: breakResumeLog.details
  });

  // Cleanup test record
  await query("DELETE FROM attendance WHERE id = $1", [recordId]);
  console.log("\n==================================================");
  console.log("🎉 ALL BREAK SYSTEM TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
  process.exit(0);
}

testBreakSystem().catch(err => {
  console.error("❌ Test error:", err);
  process.exit(1);
});
