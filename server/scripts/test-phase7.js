import http from "http";
import app from "../src/app.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { query } from "../src/config/db.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "hrms_jwt_super_secret_railway_2026";

async function runPhase7Tests() {
  console.log("==================================================");
  console.log("🧪 PHASE 7 AUTOMATED PAYROLL ENGINE VERIFICATION");
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

  const testMonth = "TestMonth_" + Date.now();
  const testYear = 2026;

  try {
    // 1. Authenticate Admin User
    console.log("1. Authenticate Admin User:");
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@teamcarrezza.com", password: "12345678" })
    });
    const loginData = await loginRes.json();
    assert("Admin login returns 200 OK", loginRes.status === 200);
    const adminToken = loginData.token;
    const adminUser = loginData.user;
    const companyId = adminUser.company_id || "carrezza-global-solutions";

    // 2. Batch Payroll Calculation Endpoint
    console.log("\n2. Automated Batch Payroll Calculation (/api/payroll/calculate):");
    const calcRes = await fetch(`${baseUrl}/payroll/calculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        companyId,
        month: testMonth,
        year: testYear,
        workingDays: 30
      })
    });
    const calcData = await calcRes.json();
    assert("POST /payroll/calculate returns 200 OK", calcRes.status === 200);
    assert("Batch calculation processed active employees", calcData.count > 0 && Array.isArray(calcData.payrolls));

    // 3. Inspect Calculated Payroll Integrity
    console.log("\n3. Salary & Statutory Item Accuracy Verification:");
    const validCalc = calcData.payrolls.find(p => p.grossSalary > 0) || calcData.payrolls[0];
    assert("Payroll status initialized as 'draft'", validCalc.status === "draft");
    assert("Basic salary computed as 50% of gross", validCalc.basicSalary === Math.round((validCalc.grossSalary * 0.5) * 100) / 100);
    assert("Net payable salary computed correctly", validCalc.netSalary > 0 && validCalc.netSalary <= validCalc.grossSalary);

    // 4. Fetch Payroll Records (/api/payroll):
    console.log("\n4. Fetch Payroll Records (/api/payroll):");
    const getRes = await fetch(`${baseUrl}/payroll?companyId=${companyId}&month=${testMonth}&year=${testYear}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const records = await getRes.json();
    assert("GET /payroll returns calculated records", Array.isArray(records) && records.length === calcData.count);

    // 5. Batch Payroll Approval & Notification Dispatch
    console.log("\n5. Batch Approval & In-App Notification Dispatch (/api/payroll/approve):");
    const approveRes = await fetch(`${baseUrl}/payroll/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        companyId,
        month: testMonth,
        year: testYear
      })
    });
    const approveData = await approveRes.json();
    assert("POST /payroll/approve returns 200 OK", approveRes.status === 200);
    assert("Approval count matches calculated employee count", approveData.count === calcData.count);

    // 6. Verify Status updated to 'paid' in Database
    const updatedStatusRes = await query(
      "SELECT status FROM payroll WHERE month = $1 AND year = $2 LIMIT 1",
      [testMonth, testYear]
    );
    assert("Payroll status transitioned to 'paid'", updatedStatusRes.rows[0]?.status === "paid");

    // 7. Verify In-App Notification generated for employee
    const notifRes = await query(
      "SELECT * FROM notifications WHERE type = 'payroll' AND title LIKE $1 ORDER BY created_at DESC LIMIT 1",
      [`%${testMonth}%`]
    );
    assert("In-app notification created in notifications table", notifRes.rows.length > 0);

    // 8. Role-Based Payroll Scoping (Employee cannot read other employee payroll)
    console.log("\n6. Role-Based Scoping & Privacy Verification:");
    const employeeToken = jwt.sign(
      { id: validCalc.employeeId, email: "employee@test.com", role: "employee", companyId },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const empPayrollRes = await fetch(`${baseUrl}/payroll?companyId=${companyId}&month=${testMonth}&year=${testYear}`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    const empRecords = await empPayrollRes.json();
    assert("Employee GET /payroll scoped strictly to own record (length === 1)", Array.isArray(empRecords) && empRecords.length === 1 && empRecords[0].employeeId === validCalc.employeeId);

    // 9. Cleanup Test Records
    console.log("\n7. Cleanup:");
    await query("DELETE FROM payroll WHERE month = $1 AND year = $2", [testMonth, testYear]).catch(() => {});
    await query("DELETE FROM notifications WHERE type = 'payroll' AND title LIKE $1", [`%${testMonth}%`]).catch(() => {});

    console.log("\n==================================================");
    console.log(`📊 PHASE 7 VERIFICATION: ${passed} Passed, ${failed} Failed`);
    console.log("==================================================");
  } catch (err) {
    console.error("Test execution error:", err);
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runPhase7Tests();
