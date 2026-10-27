import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { query } from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:5001/api";
const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_dev";

describe("Workspace-Aware Routing & Login Resolution Tests", () => {
  let techteamCompanyId;
  let otherCompanyId;
  let techteamUserEmail = `tech_emp_${Date.now()}@example.com`;
  let otherUserEmail = `other_emp_${Date.now()}@example.com`;
  let orphanedUserEmail = `orphan_${Date.now()}@example.com`;
  let testPassword = "Password123!";
  let passwordHash;
  let testUserIds = [];

  before(async () => {
    passwordHash = await bcrypt.hash(testPassword, 10);

    // 1. Verify techteam company exists
    const compRes = await query("SELECT id, name, slug, status FROM companies WHERE slug = 'techteam' OR id = 'techteam'");
    assert.ok(compRes.rows.length > 0, "Company 'techteam' must exist in DB");
    techteamCompanyId = compRes.rows[0].id;
    assert.strictEqual(compRes.rows[0].status, "active", "Company 'techteam' must be active");

    // 2. Fetch another company for tenant isolation testing
    const otherCompRes = await query("SELECT id, name, slug FROM companies WHERE id != $1 AND status = 'active' LIMIT 1", [techteamCompanyId]);
    assert.ok(otherCompRes.rows.length > 0, "At least one other active company must exist in DB");
    otherCompanyId = otherCompRes.rows[0].id;

    // 3. Create a test employee belonging to techteam
    const uid1 = "usr_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const u1 = await query(
      `INSERT INTO users (id, name, email, password_hash, role, company_id, shift_start, shift_end, status)
       VALUES ($1, $2, $3, $4, 'employee', $5, '09:00', '18:00', 'active') RETURNING id`,
      [uid1, "Tech Team Tester", techteamUserEmail, passwordHash, techteamCompanyId]
    );
    testUserIds.push(u1.rows[0].id);

    // 4. Create a test employee belonging to the other company
    const uid2 = "usr_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const u2 = await query(
      `INSERT INTO users (id, name, email, password_hash, role, company_id, shift_start, shift_end, status)
       VALUES ($1, $2, $3, $4, 'employee', $5, '09:00', '18:00', 'active') RETURNING id`,
      [uid2, "Other Company Tester", otherUserEmail, passwordHash, otherCompanyId]
    );
    testUserIds.push(u2.rows[0].id);

    // 5. Create an orphaned employee with NULL company_id
    const uid3 = "usr_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const u3 = await query(
      `INSERT INTO users (id, name, email, password_hash, role, company_id, shift_start, shift_end, status)
       VALUES ($1, $2, $3, $4, 'employee', NULL, '09:00', '18:00', 'active') RETURNING id`,
      [uid3, "Orphan Tester", orphanedUserEmail, passwordHash]
    );
    testUserIds.push(u3.rows[0].id);
  });

  after(async () => {
    // Clean up created test users and any OTP records
    for (const uid of testUserIds) {
      await query("DELETE FROM login_otps WHERE user_id = $1", [uid]);
      await query("DELETE FROM users WHERE id = $1", [uid]);
    }
  });

  it("1. Valid workspace slug 'techteam' resolves to its canonical company ID via GET /api/companies/slug/:slug", async () => {
    const res = await fetch(`${BASE_URL}/companies/slug/techteam`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.id, techteamCompanyId);
    assert.strictEqual(body.slug.toLowerCase(), "techteam");
    assert.strictEqual(body.status, "active");
  });

  it("2. Case-insensitive slug lookup works (e.g. 'TechTeam')", async () => {
    const res = await fetch(`${BASE_URL}/companies/slug/TechTeam`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.id, techteamCompanyId);
  });

  it("3. Unknown workspace slug returns 404 with clear error", async () => {
    const res = await fetch(`${BASE_URL}/companies/slug/nonexistent-workspace-xyz`);
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.ok(body.error, "Should have error message");
  });

  it("4. Login with invalid workspace slug returns 404", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: techteamUserEmail,
        password: testPassword,
        companySlug: "nonexistent-workspace-xyz"
      })
    });
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.ok(body.error.includes("not found"));
  });

  it("5. Valid user associated with techteam can initiate login with companySlug = 'techteam'", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: techteamUserEmail,
        password: testPassword,
        companySlug: "techteam"
      })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.mfaRequired, true);
    assert.ok(body.pendingToken, "Must return pendingToken for MFA");

    // Verify token contains expectedCompanyId
    const decoded = jwt.decode(body.pendingToken);
    assert.strictEqual(decoded.expectedCompanyId, techteamCompanyId);
  });

  it("6. User belonging to another company cannot log into techteam (rejected with 403 tenant mismatch)", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: otherUserEmail,
        password: testPassword,
        companySlug: "techteam"
      })
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.ok(body.error.toLowerCase().includes("access denied") || body.error.toLowerCase().includes("different organization"));
  });

  it("7. Orphaned user without company_id cannot log into techteam (rejected with 403)", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: orphanedUserEmail,
        password: testPassword,
        companySlug: "techteam"
      })
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.ok(body.error.toLowerCase().includes("not linked"));
  });

  it("8. Existing standard login without companySlug continues working", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: techteamUserEmail,
        password: testPassword
      })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.mfaRequired, true);
  });

  it("9. Signup through companySlug = 'techteam' resolves and assigns canonical company ID", async () => {
    const signupEmail = `signup_tech_${Date.now()}@example.com`;
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Signup Tester",
        email: signupEmail,
        password: "NewPassword123!",
        department: "Engineering",
        companySlug: "techteam"
      })
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.ok(body.token, "Must return session token upon registration");
    assert.strictEqual(body.user.company_id, techteamCompanyId);

    // Verify token payload
    const decoded = jwt.decode(body.token);
    assert.strictEqual(decoded.companyId, techteamCompanyId);

    // Cleanup signup test user
    if (body.user.id) {
      await query("DELETE FROM users WHERE id = $1", [body.user.id]);
    }
  });
});
