import http from "http";
import app from "../src/app.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "hrms_jwt_super_secret_railway_2026";

async function verifyNewFeatures() {
  console.log("==================================================");
  console.log("🧪 PHASE 1-3 DEEP INTEGRATION VERIFICATION");
  console.log("==================================================");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;
  console.log(`📡 Local test server listening on port ${port}...\n`);

  let passed = 0;
  let failed = 0;

  const assert = (desc, condition) => {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  };

  try {
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@teamcarrezza.com", password: "12345678" })
    });
    const loginData = await loginRes.json();
    const adminToken = loginData.token;
    const adminUserId = loginData.user.id;
    const companyId = loginData.user.company_id || "carrezza-global-solutions";

    // 1. Notifications API
    console.log("1. In-App Notifications API Test:");
    const createNotifRes = await fetch(`${baseUrl}/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: adminUserId,
        title: "Test Alert",
        message: "Integration test notification",
        type: "success"
      })
    });
    const notifData = await createNotifRes.json();
    assert("POST /notifications returns 201 Created", createNotifRes.status === 201);
    assert("Notification record contains valid ID", Boolean(notifData.id));

    const getNotifRes = await fetch(`${baseUrl}/notifications?userId=${adminUserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const notifList = await getNotifRes.json();
    assert("GET /notifications returns user notification list", Array.isArray(notifList) && notifList.length > 0);

    const markReadRes = await fetch(`${baseUrl}/notifications/${notifData.id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert("PATCH /notifications/:id/read returns 200 OK", markReadRes.status === 200);

    // 2. Task Timers
    console.log("\n2. Task Timers API Test:");
    // Create a temporary task to test timer on
    const createTaskRes = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: "Verification Task",
        description: "Automated test task",
        companyId: companyId
      })
    });
    const taskData = await createTaskRes.json();
    assert("POST /tasks creates test task", createTaskRes.status === 201);

    const startTimerRes = await fetch(`${baseUrl}/tasks/${taskData.id}/start-timer`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const timerData = await startTimerRes.json();
    assert("POST /tasks/:id/start-timer returns 200 and status in-progress", startTimerRes.status === 200 && timerData.status === "in-progress");

    const stopTimerRes = await fetch(`${baseUrl}/tasks/${taskData.id}/stop-timer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        reportText: "Worked on automated tests",
        timeSpentMinutes: 30
      })
    });
    const stopData = await stopTimerRes.json();
    assert("POST /tasks/:id/stop-timer returns 200 and logs task report", stopTimerRes.status === 200 && stopData.timerStartedAt === null);

    // Clean up test task
    await fetch(`${baseUrl}/tasks/${taskData.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // 3. Shift Breaks
    console.log("\n3. Shift Break API Test:");
    // Check in first
    const checkInRes = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: adminUserId,
        companyId: companyId
      })
    });
    assert("POST /attendance/check-in returns 200", checkInRes.status === 200);

    const startBreakRes = await fetch(`${baseUrl}/attendance/start-break`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: adminUserId,
        breakType: "short",
        reason: "Tea break"
      })
    });
    const breakData = await startBreakRes.json();
    assert("POST /attendance/start-break returns 200 and on-break status", startBreakRes.status === 200 && breakData.status === "on-break");

    const endBreakRes = await fetch(`${baseUrl}/attendance/end-break`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: adminUserId
      })
    });
    const endBreakData = await endBreakRes.json();
    assert("POST /attendance/end-break returns 200 and checked-in status", endBreakRes.status === 200 && endBreakData.status === "checked-in");

    // Check out
    const checkOutRes = await fetch(`${baseUrl}/attendance/check-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: adminUserId
      })
    });
    const checkoutData = await checkOutRes.json();
    assert("POST /attendance/check-out accounts for breaks and returns checked-out", checkOutRes.status === 200 && checkoutData.status === "checked-out");

    console.log("\n==================================================");
    console.log(`📊 NEW FEATURES VERIFICATION: ${passed} Passed, ${failed} Failed`);
    console.log("==================================================");
  } catch (err) {
    console.error("Test execution error:", err);
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

verifyNewFeatures();
