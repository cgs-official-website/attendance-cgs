import http from "http";
import app from "../src/app.js";
import dotenv from "dotenv";
import { query } from "../src/config/db.js";

dotenv.config();

async function runPhase5Tests() {
  console.log("==================================================");
  console.log("🧪 PHASE 5 DUAL-SYNC & TASK LIFECYCLE VERIFICATION");
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
    // 1. Authenticate as Admin
    console.log("1. Authenticate Admin User:");
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@teamcarrezza.com", password: "12345678" })
    });
    const loginData = await loginRes.json();
    assert("Admin login returns 200 OK", loginRes.status === 200);
    const token = loginData.token;
    const adminUser = loginData.user;
    const companyId = adminUser.company_id || "carrezza-global-solutions";

    // 2. Direct PostgreSQL Task Table Creation
    console.log("\n2. Direct PostgreSQL Tasks API Lifecycle:");
    const createTaskRes = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        title: "Phase 5 Live Sync Task",
        description: "Testing dual-sync and live timers",
        companyId: companyId,
        assigneeId: adminUser.id,
        priority: "high"
      })
    });
    const createdTask = await createTaskRes.json();
    assert("POST /tasks creates task with 201 Created", createTaskRes.status === 201);
    assert("Task record has valid ID and status 'pending'", Boolean(createdTask.id) && createdTask.status === "pending");

    // 3. Start Live Task Timer
    console.log("\n3. Start Live Task Timer:");
    const startTimerRes = await fetch(`${baseUrl}/tasks/${createdTask.id}/start-timer`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    const startTimerData = await startTimerRes.json();
    assert("POST /tasks/:id/start-timer returns 200 OK", startTimerRes.status === 200);
    assert("Task status transitions to 'in-progress'", startTimerData.status === "in-progress");
    assert("Task metadata contains active timerStartedAt", Boolean(startTimerData.timerStartedAt));

    // 4. Stop Task Timer & Generate Task Report
    console.log("\n4. Stop Live Task Timer & Generate Report:");
    const stopTimerRes = await fetch(`${baseUrl}/tasks/${createdTask.id}/stop-timer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        reportText: "Executed live timer verification test",
        timeSpentMinutes: 45
      })
    });
    const stopTimerData = await stopTimerRes.json();
    assert("POST /tasks/:id/stop-timer returns 200 OK", stopTimerRes.status === 200);
    assert("Task timerStartedAt is cleared (null)", stopTimerData.timerStartedAt === null);
    assert("Task report is automatically created and logged", Boolean(stopTimerData.report?.id));

    // 5. Update Task Status via PATCH /tasks/:id
    console.log("\n5. Update Task Status & Dual-Sync:");
    const updateRes = await fetch(`${baseUrl}/tasks/${createdTask.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: "completed" })
    });
    const updatedTask = await updateRes.json();
    assert("PATCH /tasks/:id returns 200 OK", updateRes.status === 200);
    assert("Task status updated to 'completed'", updatedTask.status === "completed");

    // 6. Verify User Controller Metadata Sync
    console.log("\n6. User Controller Task Metadata Dual-Sync:");
    const userUpdateRes = await fetch(`${baseUrl}/users/${adminUser.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        tasks: [
          {
            id: createdTask.id,
            title: "Phase 5 Live Sync Task",
            completed: true,
            status: "completed"
          }
        ]
      })
    });
    assert("PUT /users/:id with tasks returns 200 OK", userUpdateRes.status === 200);

    // 7. Manual Hourly Task Report via /reports/tasks
    console.log("\n7. Hourly Task Report API Test:");
    const reportRes = await fetch(`${baseUrl}/reports/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        taskId: createdTask.id,
        content: "Detailed progress report for PM review",
        timeSpentMinutes: 30,
        companyId: companyId
      })
    });
    const reportData = await reportRes.json();
    assert("POST /reports/tasks returns 201 Created", reportRes.status === 201);
    assert("Task report contains valid ID and content", Boolean(reportData.id) && reportData.content === "Detailed progress report for PM review");

    // 8. Fetch Task Reports for Task
    const getReportsRes = await fetch(`${baseUrl}/reports/tasks?taskId=${createdTask.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const reportsList = await getReportsRes.json();
    assert("GET /reports/tasks returns reports list with length >= 2", Array.isArray(reportsList) && reportsList.length >= 2);

    // 9. Cleanup Test Task
    console.log("\n9. Task Cleanup:");
    const deleteRes = await fetch(`${baseUrl}/tasks/${createdTask.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert("DELETE /tasks/:id returns 200 OK", deleteRes.status === 200);

    // Also clean up task_reports created during test
    await query("DELETE FROM task_reports WHERE task_id = $1", [createdTask.id]).catch(() => {});

    console.log("\n==================================================");
    console.log(`📊 PHASE 5 VERIFICATION: ${passed} Passed, ${failed} Failed`);
    console.log("==================================================");
  } catch (err) {
    console.error("Test execution error:", err);
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runPhase5Tests();
