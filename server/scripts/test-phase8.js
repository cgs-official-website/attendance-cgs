import http from "http";
import app from "../src/app.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { query } from "../src/config/db.js";
import { generateToken } from "../src/middlewares/auth.js";

dotenv.config();

async function runPhase8Tests() {
  console.log("==================================================");
  console.log("🧪 PHASE 8 ASSET LIFECYCLE & ALLOCATION VERIFICATION");
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

  let testAssetId1 = null;
  let testAssetId2 = null;

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

    // 2. Fetch Employee for Allocation Tests
    console.log("\n2. Identify Employee User for Allocation:");
    const empRes = await query("SELECT id, name, email, company_id, role FROM users WHERE role = 'employee' LIMIT 1");
    assert("Found active employee record in database", empRes.rows.length > 0);
    const employee = empRes.rows[0];
    const employeeToken = generateToken({
      id: employee.id,
      email: employee.email,
      role: "employee",
      companyId: employee.company_id || companyId
    });
    console.log(`  ℹ️ Target Employee: ${employee.name} (${employee.id})`);

    // 3. Admin Creates an Asset (POST /api/assets)
    console.log("\n3. Equipment Registry - Admin creates asset (/api/assets):");
    const testSerial1 = "SN-P8-" + Date.now().toString(36).toUpperCase();
    const createRes = await fetch(`${baseUrl}/assets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: "MacBook Pro M3 Max 16-inch",
        category: ["Laptop", "Hardware"],
        serialNumber: testSerial1,
        status: "Available",
        companyId
      })
    });
    const createData = await createRes.json();
    assert("Asset created with HTTP 201", createRes.status === 201);
    assert("Asset ID generated correctly", Boolean(createData.id));
    assert("Asset status initialized to Available", createData.status === "Available");
    assert("Asset serial number matched", createData.serialNumber === testSerial1);
    testAssetId1 = createData.id;

    // 4. Admin Allocates Asset to Employee (PATCH /api/assets/:id)
    console.log("\n4. Equipment Allocation - Admin assigns asset to employee:");
    const assignRes = await fetch(`${baseUrl}/assets/${testAssetId1}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        assignedUserId: employee.id,
        status: "Assigned",
        assignedDate: new Date().toISOString().split("T")[0]
      })
    });
    const assignData = await assignRes.json();
    assert("Asset updated with HTTP 200", assignRes.status === 200);
    assert("Asset assignedUserId matches employee", assignData.assignedUserId === employee.id);
    assert("Asset status updated to Assigned", assignData.status === "Assigned");

    // 5. Verify Automated In-App Notification for Employee
    console.log("\n5. In-App Notification Verification:");
    const notifRes = await query(
      "SELECT * FROM notifications WHERE user_id = $1 AND type = 'asset' ORDER BY created_at DESC LIMIT 1",
      [employee.id]
    );
    assert("In-app notification generated for employee", notifRes.rows.length > 0);
    if (notifRes.rows.length > 0) {
      const notif = notifRes.rows[0];
      assert("Notification title is Equipment Allocation Update", notif.title === "Equipment Allocation Update");
      assert("Notification references equipment name", notif.message.includes("MacBook Pro M3 Max"));
      assert("Notification link navigates to /profile", notif.link === "/profile");
    }

    // 6. Admin Creates a Second Unassigned Asset
    console.log("\n6. Create 2nd Asset (Unassigned) to Verify Employee Role Scoping:");
    const testSerial2 = "SN-P8-UNASSIGNED-" + Date.now().toString(36).toUpperCase();
    const createRes2 = await fetch(`${baseUrl}/assets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: "Dell UltraSharp 4K Monitor",
        category: ["Peripheral"],
        serialNumber: testSerial2,
        status: "Available",
        companyId
      })
    });
    const createData2 = await createRes2.json();
    assert("Second asset created with HTTP 201", createRes2.status === 201);
    testAssetId2 = createData2.id;

    // 7. Employee Access Control & Role-based Scoping Test
    console.log("\n7. Employee Role-based Scoping Test (GET /api/assets with Employee Token):");
    const empGetRes = await fetch(`${baseUrl}/assets?companyId=${companyId}`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    const empAssets = await empGetRes.json();
    assert("Employee GET /api/assets returns 200 OK", empGetRes.status === 200);
    assert("Employee can see assigned MacBook asset", empAssets.some((a) => a.id === testAssetId1));
    assert("Employee CANNOT see unassigned Dell monitor (Strict privacy scope)", !empAssets.some((a) => a.id === testAssetId2));
    assert("Every asset returned to employee is strictly assigned to them", empAssets.every((a) => (a.assignedUserId === employee.id || a.assigned_to === employee.id)));

    // 8. Admin Access Control Test (Should see all company assets)
    console.log("\n8. Admin Global Scoping Test (GET /api/assets with Admin Token):");
    const adminGetRes = await fetch(`${baseUrl}/assets?companyId=${companyId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminAssets = await adminGetRes.json();
    assert("Admin GET /api/assets returns 200 OK", adminGetRes.status === 200);
    assert("Admin can see assigned MacBook asset", adminAssets.some((a) => a.id === testAssetId1));
    assert("Admin can see unassigned Dell monitor", adminAssets.some((a) => a.id === testAssetId2));

    // 9. Equipment Return / De-allocation Lifecycle Test
    console.log("\n9. Equipment Return / De-allocation Lifecycle:");
    const returnRes = await fetch(`${baseUrl}/assets/${testAssetId1}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        assignedUserId: null,
        assignedUser: null,
        status: "Returned"
      })
    });
    const returnData = await returnRes.json();
    assert("Asset de-allocated with HTTP 200", returnRes.status === 200);
    assert("Asset status changed to Returned", returnData.status === "Returned");
    assert("Asset assignedUser is cleared", !returnData.assignedUser && !returnData.assignedUserId);

    // Verify Return Notification
    const returnNotifRes = await query(
      "SELECT * FROM notifications WHERE user_id = $1 AND title = 'Equipment Returned' ORDER BY created_at DESC LIMIT 1",
      [employee.id]
    );
    assert("Equipment Returned in-app notification delivered to employee", returnNotifRes.rows.length > 0);

    // 10. Asset Deletion Lifecycle Test (DELETE /api/assets/:id)
    console.log("\n10. Asset Cleanup & Deletion:");
    const del1 = await fetch(`${baseUrl}/assets/${testAssetId1}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert("Asset 1 deleted with 200 OK", del1.status === 200);

    const del2 = await fetch(`${baseUrl}/assets/${testAssetId2}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert("Asset 2 deleted with 200 OK", del2.status === 200);

    // Verify DB removal
    const dbCheck = await query("SELECT id FROM assets WHERE id IN ($1, $2)", [testAssetId1, testAssetId2]);
    assert("Assets successfully purged from database", dbCheck.rows.length === 0);

  } catch (err) {
    console.error("❌ Unexpected test execution error:", err);
    failed++;
  } finally {
    // Cleanup any lingering test records
    if (testAssetId1 || testAssetId2) {
      await query("DELETE FROM assets WHERE id IN ($1, $2)", [testAssetId1, testAssetId2]).catch(() => {});
    }
    server.close();
  }

  console.log("\n==================================================");
  console.log(`🏁 Phase 8 Test Suite Finished: ${passed} Passed, ${failed} Failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase8Tests();
