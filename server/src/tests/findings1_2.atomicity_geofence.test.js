/**
 * Automated Test Suite for Finding 1 (Transaction Atomicity) and Finding 2 (Fail-Closed Geofencing)
 * =================================================================================================
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../app.js";
import { query } from "../config/db.js";
import { generateToken } from "../middlewares/auth.js";
import { generateVerificationSessionToken } from "../services/livenessVerification.js";
import {
  validateServerGeofence,
  HR_CONFIG_ERROR
} from "../utils/geofence.js";

const PORT = 5095;
let server;
let baseUrl;

const companyF1 = "company_f1_atomicity";
const companyF2 = "company_f2_isolation";
const companyF3 = "company_f3_disabled";

const testUser1 = {
  id: "test_user_atomicity_1",
  email: "user_atomicity_1@example.com",
  role: "employee",
  companyId: companyF1
};

const testUser2 = {
  id: "test_user_atomicity_2",
  email: "user_atomicity_2@example.com",
  role: "employee",
  companyId: companyF2
};

const user1Token = generateToken(testUser1);
const user2Token = generateToken(testUser2);

describe("Finding 1 & 2: Transaction Atomicity and Fail-Closed Geofencing Suite", () => {
  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(PORT, resolve));
    baseUrl = `http://127.0.0.1:${PORT}/api`;

    // 1. Seed companies
    await query(
      `INSERT INTO companies (id, name, latitude, longitude, allowed_radius_meters)
       VALUES ($1, 'F1 Atomicity Corp', 13.0827, 80.2707, 100),
              ($2, 'F2 Isolation Corp', 12.9716, 77.5946, 200),
              ($3, 'F3 Disabled Corp', NULL, NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         allowed_radius_meters = EXCLUDED.allowed_radius_meters`,
      [companyF1, companyF2, companyF3]
    );

    // 2. Seed test users
    for (const u of [testUser1, testUser2]) {
      await query(
        `INSERT INTO users (id, name, email, password_hash, role, company_id, status)
         VALUES ($1, $2, $3, 'hash_test', $4, $5, 'active')
         ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id`,
        [u.id, u.email.split("@")[0], u.email, u.role, u.companyId]
      );
    }
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    // Clean up test data
    await query(`DELETE FROM attendance_verification_sessions WHERE user_id IN ($1, $2)`, [testUser1.id, testUser2.id]);
    await query(`DELETE FROM attendance_verification_attempts WHERE user_id IN ($1, $2)`, [testUser1.id, testUser2.id]);
    await query(`DELETE FROM attendance WHERE user_id IN ($1, $2)`, [testUser1.id, testUser2.id]);
    await query(`DELETE FROM environment_settings WHERE company_id IN ($1, $2, $3)`, [companyF1, companyF2, companyF3]);
  });

  // =========================================================================
  // FINDING 2: FAIL-CLOSED GEOFENCING TESTS
  // =========================================================================

  describe("Finding 2: Fail-Closed Geofencing", () => {
    it("2.1 Valid circular radius check inside workplace", async () => {
      const res = await validateServerGeofence({
        companyId: companyF1,
        location: { latitude: 13.0827, longitude: 80.2707 },
        user: testUser1
      });
      assert.equal(res.allowed, true);
      assert.equal(res.gpsResult, "inside");
      assert.ok(typeof res.distance === "number");
    });

    it("2.2 Circular radius check rejects outside location", async () => {
      const res = await validateServerGeofence({
        companyId: companyF1,
        location: { latitude: 13.1000, longitude: 80.3000 },
        user: testUser1
      });
      assert.equal(res.allowed, false);
      assert.equal(res.gpsResult, "outside");
      assert.match(res.reason, /Location is outside authorized workplace/i);
    });

    it("2.3 Reject when office coordinates are missing (fail-closed)", async () => {
      const compIncomplete = "comp_missing_coords_" + Date.now();
      await query(
        `INSERT INTO companies (id, name, latitude, longitude, allowed_radius_meters)
         VALUES ($1, 'Incomplete Co', NULL, NULL, 100)
         ON CONFLICT (id) DO UPDATE SET latitude = NULL, longitude = NULL`,
        [compIncomplete]
      );

      const res = await validateServerGeofence({
        companyId: compIncomplete,
        location: { latitude: 13.0827, longitude: 80.2707 },
        user: { ...testUser1, companyId: compIncomplete }
      });

      assert.equal(res.allowed, false);
      assert.equal(res.gpsResult, "invalid_config");
      assert.equal(res.reason, HR_CONFIG_ERROR);

      await query(`DELETE FROM companies WHERE id = $1`, [compIncomplete]);
    });

    it("2.4 Reject when office coordinates are invalid/out of range (fail-closed)", async () => {
      const compInvalid = "comp_invalid_coords_" + Date.now();
      await query(
        `INSERT INTO companies (id, name, latitude, longitude, allowed_radius_meters)
         VALUES ($1, 'Invalid Co', 195.0000, 80.2707, 100)
         ON CONFLICT (id) DO UPDATE SET latitude = 195.0, longitude = 80.2707`,
        [compInvalid]
      );

      const res = await validateServerGeofence({
        companyId: compInvalid,
        location: { latitude: 13.0827, longitude: 80.2707 },
        user: { ...testUser1, companyId: compInvalid }
      });

      assert.equal(res.allowed, false);
      assert.equal(res.gpsResult, "invalid_config");
      assert.equal(res.reason, HR_CONFIG_ERROR);

      await query(`DELETE FROM companies WHERE id = $1`, [compInvalid]);
    });

    it("2.5 Reject when allowed radius is missing or non-positive (fail-closed)", async () => {
      const compNoRadius = "comp_no_radius_" + Date.now();
      await query(
        `INSERT INTO companies (id, name, latitude, longitude, allowed_radius_meters)
         VALUES ($1, 'No Radius Co', 13.0827, 80.2707, NULL)
         ON CONFLICT (id) DO UPDATE SET allowed_radius_meters = NULL`,
        [compNoRadius]
      );

      const res = await validateServerGeofence({
        companyId: compNoRadius,
        location: { latitude: 13.0827, longitude: 80.2707 },
        user: { ...testUser1, companyId: compNoRadius }
      });

      assert.equal(res.allowed, false);
      assert.equal(res.gpsResult, "invalid_config");
      assert.equal(res.reason, HR_CONFIG_ERROR);

      await query(`DELETE FROM companies WHERE id = $1`, [compNoRadius]);
    });

    it("2.6 Valid polygon boundary check inside and outside", async () => {
      const compPoly = "comp_polygon_" + Date.now();
      const polygonCoords = [
        { lat: 13.0800, lng: 80.2600 },
        { lat: 13.0900, lng: 80.2600 },
        { lat: 13.0850, lng: 80.2800 }
      ];

      await query(
        `INSERT INTO companies (id, name) VALUES ($1, 'Polygon Co') ON CONFLICT (id) DO NOTHING`,
        [compPoly]
      );

      await query(
        `INSERT INTO environment_settings (id, company_id, category, key, value)
         VALUES ($1, $2, 'geofence', 'geofence_settings', $3)
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value`,
        [
          `env_${compPoly}`,
          compPoly,
          JSON.stringify({
            enable_geofencing: true,
            type: "polygon",
            polygonCoords
          })
        ]
      );

      // Point inside polygon
      const resInside = await validateServerGeofence({
        companyId: compPoly,
        location: { latitude: 13.0840, longitude: 80.2650 },
        user: { id: "test_u", companyId: compPoly }
      });
      assert.equal(resInside.allowed, true);
      assert.equal(resInside.gpsResult, "inside");

      // Point outside polygon
      const resOutside = await validateServerGeofence({
        companyId: compPoly,
        location: { latitude: 13.0700, longitude: 80.2500 },
        user: { id: "test_u", companyId: compPoly }
      });
      assert.equal(resOutside.allowed, false);
      assert.equal(resOutside.gpsResult, "outside");
      assert.match(resOutside.reason, /polygon/i);

      await query(`DELETE FROM environment_settings WHERE company_id = $1`, [compPoly]);
      await query(`DELETE FROM companies WHERE id = $1`, [compPoly]);
    });

    it("2.7 Malformed polygon rejects attendance (fail-closed)", async () => {
      const compBadPoly = "comp_bad_poly_" + Date.now();
      await query(
        `INSERT INTO companies (id, name) VALUES ($1, 'Bad Polygon Co') ON CONFLICT (id) DO NOTHING`,
        [compBadPoly]
      );

      // Only 2 points (invalid polygon)
      await query(
        `INSERT INTO environment_settings (id, company_id, category, key, value)
         VALUES ($1, $2, 'geofence', 'geofence_settings', $3)`,
        [
          `env_${compBadPoly}`,
          compBadPoly,
          JSON.stringify({
            enable_geofencing: true,
            type: "polygon",
            polygonCoords: [{ lat: 13.08, lng: 80.27 }, { lat: 13.09, lng: 80.28 }]
          })
        ]
      );

      const res = await validateServerGeofence({
        companyId: compBadPoly,
        location: { latitude: 13.085, longitude: 80.275 },
        user: { id: "test_u", companyId: compBadPoly }
      });
      assert.equal(res.allowed, false);
      assert.equal(res.gpsResult, "invalid_config");
      assert.equal(res.reason, HR_CONFIG_ERROR);

      await query(`DELETE FROM environment_settings WHERE company_id = $1`, [compBadPoly]);
      await query(`DELETE FROM companies WHERE id = $1`, [compBadPoly]);
    });

    it("2.8 Company/tenant isolation: Company A location cannot validate Company B", async () => {
      // Company A is at Chennai (13.0827, 80.2707). Company B is at Bangalore (12.9716, 77.5946)
      const res = await validateServerGeofence({
        companyId: companyF2,
        location: { latitude: 13.0827, longitude: 80.2707 },
        user: testUser2
      });
      assert.equal(res.allowed, false);
      assert.equal(res.gpsResult, "outside");
    });

    it("2.9 Explicitly disabled geofencing is preserved", async () => {
      await query(
        `INSERT INTO environment_settings (id, company_id, category, key, value)
         VALUES ($1, $2, 'geofence', 'geofence_settings', $3)
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value`,
        [
          `env_${companyF3}`,
          companyF3,
          JSON.stringify({ enable_geofencing: false })
        ]
      );

      const res = await validateServerGeofence({
        companyId: companyF3,
        location: { latitude: 0, longitude: 0 },
        user: { ...testUser1, companyId: companyF3 }
      });
      assert.equal(res.allowed, true);
      assert.equal(res.gpsResult, "not_required");
    });
  });

  // =========================================================================
  // FINDING 1: TRANSACTION ATOMICITY TESTS
  // =========================================================================

  describe("Finding 1: Transaction Atomicity", () => {
    it("1.1 Attendance DB write failure rolls back session consumption and allows retry", async () => {
      const { rawToken, tokenHash } = generateVerificationSessionToken();
      const sessionId = "avs_tx_rollback_" + Date.now();
      const attemptId = "ava_tx_rollback_" + Date.now();
      const today = new Date().toISOString().split("T")[0];

      // Ensure clean state for testUser1
      await query(`DELETE FROM attendance WHERE id = $1`, [`${testUser1.id}_${today}`]);

      // Seed attempt and issued session token
      await query(
        `INSERT INTO attendance_verification_attempts (
           id, user_id, company_id, work_mode, status, gps_result, face_result, liveness_result, model
         ) VALUES ($1, $2, $3, 'office', 'verified', 'inside', 'matched', 'not_checked', 'ArcFace')`,
        [attemptId, testUser1.id, companyF1]
      );

      await query(
        `INSERT INTO attendance_verification_sessions (
           id, attempt_id, user_id, company_id, token_hash, provider, status, expires_at, action_type
         ) VALUES ($1, $2, $3, $4, $5, 'internal', 'issued', CURRENT_TIMESTAMP + INTERVAL '5 minutes', 'check-in')`,
        [sessionId, attemptId, testUser1.id, companyF1, tokenHash]
      );

      // Create a temporary PostgreSQL check constraint or trigger that intentionally aborts attendance insertion
      await query(
        `CREATE OR REPLACE FUNCTION trigger_simulate_attendance_failure()
         RETURNS trigger AS $$
         BEGIN
           IF NEW.id = '${testUser1.id}_${today}' AND NEW.work_mode = 'fail_simulation' THEN
             RAISE EXCEPTION 'Simulated attendance database write failure';
           END IF;
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;`
      );

      await query(
        `DROP TRIGGER IF EXISTS trg_test_fail_sim ON attendance;
         CREATE TRIGGER trg_test_fail_sim
         BEFORE INSERT OR UPDATE ON attendance
         FOR EACH ROW EXECUTE FUNCTION trigger_simulate_attendance_failure();`
      );

      // First attempt: triggers simulated DB failure during attendance insertion
      const failRes = await fetch(`${baseUrl}/attendance/check-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user1Token}`
        },
        body: JSON.stringify({
          location: { latitude: 13.0827, longitude: 80.2707 },
          workMode: "fail_simulation",
          verificationSessionToken: rawToken
        })
      });

      assert.equal(failRes.status, 500);

      // CRITICAL CHECK: Verify that the transaction rolled back and the verification session was NOT consumed!
      const sessionAfterRollback = await query(
        `SELECT * FROM attendance_verification_sessions WHERE id = $1`,
        [sessionId]
      );
      assert.equal(sessionAfterRollback.rows.length, 1);
      assert.equal(sessionAfterRollback.rows[0].status, "issued");
      assert.equal(sessionAfterRollback.rows[0].consumed_at, null);

      // Verify that no partial attendance record was committed
      const attAfterRollback = await query(`SELECT * FROM attendance WHERE id = $1`, [`${testUser1.id}_${today}`]);
      assert.equal(attAfterRollback.rows.length, 0);

      // Clean up the simulation trigger so retry can proceed
      await query(`DROP TRIGGER IF EXISTS trg_test_fail_sim ON attendance;`);
      await query(`DROP FUNCTION IF EXISTS trigger_simulate_attendance_failure();`);

      // Second attempt (RETRY with the EXACT SAME TOKEN): Must succeed because token remained unconsumed!
      const retryRes = await fetch(`${baseUrl}/attendance/check-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user1Token}`
        },
        body: JSON.stringify({
          location: { latitude: 13.0827, longitude: 80.2707 },
          workMode: "office",
          verificationSessionToken: rawToken
        })
      });

      assert.equal(retryRes.status, 200);
      const retryData = await retryRes.json();
      assert.equal(retryData.status, "checked-in");

      // Verify session token is now committed as 'consumed'
      const sessionAfterRetry = await query(
        `SELECT * FROM attendance_verification_sessions WHERE id = $1`,
        [sessionId]
      );
      assert.equal(sessionAfterRetry.rows[0].status, "consumed");
      assert.ok(sessionAfterRetry.rows[0].consumed_at);
    });

    it("1.2 Checkout prerequisite check fails safely without consuming verification token", async () => {
      const { rawToken, tokenHash } = generateVerificationSessionToken();
      const sessionId = "avs_tx_nocheckin_" + Date.now();
      const attemptId = "ava_tx_nocheckin_" + Date.now();
      const today = new Date().toISOString().split("T")[0];

      // Ensure NO check-in exists for testUser2 today
      await query(`DELETE FROM attendance WHERE id = $1`, [`${testUser2.id}_${today}`]);

      await query(
        `INSERT INTO attendance_verification_attempts (
           id, user_id, company_id, work_mode, status, gps_result, face_result, liveness_result, model
         ) VALUES ($1, $2, $3, 'office', 'verified', 'inside', 'matched', 'not_checked', 'ArcFace')`,
        [attemptId, testUser2.id, companyF2]
      );

      await query(
        `INSERT INTO attendance_verification_sessions (
           id, attempt_id, user_id, company_id, token_hash, provider, status, expires_at, action_type
         ) VALUES ($1, $2, $3, $4, $5, 'internal', 'issued', CURRENT_TIMESTAMP + INTERVAL '5 minutes', 'check-out')`,
        [sessionId, attemptId, testUser2.id, companyF2, tokenHash]
      );

      // Attempt checkout without checking in first
      const res = await fetch(`${baseUrl}/attendance/check-out`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user2Token}`
        },
        body: JSON.stringify({
          location: { latitude: 12.9716, longitude: 77.5946 },
          verificationSessionToken: rawToken
        })
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.match(data.error, /No check-in found/i);

      // CRITICAL CHECK: Verify that the session token was NOT burned/consumed!
      const sessionRes = await query(
        `SELECT * FROM attendance_verification_sessions WHERE id = $1`,
        [sessionId]
      );
      assert.equal(sessionRes.rows[0].status, "issued");
      assert.equal(sessionRes.rows[0].consumed_at, null);
    });

    it("1.3 Reused token is rejected and cannot be consumed twice", async () => {
      const { rawToken, tokenHash } = generateVerificationSessionToken();
      const sessionId = "avs_tx_reused_" + Date.now();
      const attemptId = "ava_tx_reused_" + Date.now();
      const today = new Date().toISOString().split("T")[0];

      await query(`DELETE FROM attendance WHERE id = $1`, [`${testUser1.id}_${today}`]);

      await query(
        `INSERT INTO attendance_verification_attempts (
           id, user_id, company_id, work_mode, status, gps_result, face_result, liveness_result, model
         ) VALUES ($1, $2, $3, 'office', 'verified', 'inside', 'matched', 'not_checked', 'ArcFace')`,
        [attemptId, testUser1.id, companyF1]
      );

      await query(
        `INSERT INTO attendance_verification_sessions (
           id, attempt_id, user_id, company_id, token_hash, provider, status, expires_at, action_type
         ) VALUES ($1, $2, $3, $4, $5, 'internal', 'issued', CURRENT_TIMESTAMP + INTERVAL '5 minutes', 'check-in')`,
        [sessionId, attemptId, testUser1.id, companyF1, tokenHash]
      );

      // First check-in: succeeds
      const firstRes = await fetch(`${baseUrl}/attendance/check-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user1Token}`
        },
        body: JSON.stringify({
          location: { latitude: 13.0827, longitude: 80.2707 },
          verificationSessionToken: rawToken
        })
      });
      assert.equal(firstRes.status, 200);

      // Second check-in with SAME token: 403 replay rejected
      const secondRes = await fetch(`${baseUrl}/attendance/check-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user1Token}`
        },
        body: JSON.stringify({
          location: { latitude: 13.0827, longitude: 80.2707 },
          verificationSessionToken: rawToken
        })
      });
      assert.equal(secondRes.status, 403);
    });

    it("1.4 Expired token cannot be consumed", async () => {
      const { rawToken, tokenHash } = generateVerificationSessionToken();
      const sessionId = "avs_tx_exp_" + Date.now();
      const attemptId = "ava_tx_exp_" + Date.now();

      await query(
        `INSERT INTO attendance_verification_attempts (
           id, user_id, company_id, work_mode, status, gps_result, face_result, liveness_result, model
         ) VALUES ($1, $2, $3, 'office', 'verified', 'inside', 'matched', 'not_checked', 'ArcFace')`,
        [attemptId, testUser1.id, companyF1]
      );

      await query(
        `INSERT INTO attendance_verification_sessions (
           id, attempt_id, user_id, company_id, token_hash, provider, status, created_at, expires_at, action_type
         ) VALUES ($1, $2, $3, $4, $5, 'internal', 'issued', CURRENT_TIMESTAMP - INTERVAL '10 minutes', CURRENT_TIMESTAMP - INTERVAL '5 minutes', 'check-in')`,
        [sessionId, attemptId, testUser1.id, companyF1, tokenHash]
      );

      const res = await fetch(`${baseUrl}/attendance/check-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user1Token}`
        },
        body: JSON.stringify({
          location: { latitude: 13.0827, longitude: 80.2707 },
          verificationSessionToken: rawToken
        })
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /invalid, expired, or has already been used/i);
    });

    it("1.5 Concurrent requests using the same token allow exactly one success", async () => {
      const { rawToken, tokenHash } = generateVerificationSessionToken();
      const sessionId = "avs_tx_conc_" + Date.now();
      const attemptId = "ava_tx_conc_" + Date.now();
      const today = new Date().toISOString().split("T")[0];

      await query(`DELETE FROM attendance WHERE id = $1`, [`${testUser1.id}_${today}`]);

      await query(
        `INSERT INTO attendance_verification_attempts (
           id, user_id, company_id, work_mode, status, gps_result, face_result, liveness_result, model
         ) VALUES ($1, $2, $3, 'office', 'verified', 'inside', 'matched', 'not_checked', 'ArcFace')`,
        [attemptId, testUser1.id, companyF1]
      );

      await query(
        `INSERT INTO attendance_verification_sessions (
           id, attempt_id, user_id, company_id, token_hash, provider, status, expires_at, action_type
         ) VALUES ($1, $2, $3, $4, $5, 'internal', 'issued', CURRENT_TIMESTAMP + INTERVAL '5 minutes', 'check-in')`,
        [sessionId, attemptId, testUser1.id, companyF1, tokenHash]
      );

      const makeRequest = () =>
        fetch(`${baseUrl}/attendance/check-in`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user1Token}`
          },
          body: JSON.stringify({
            location: { latitude: 13.0827, longitude: 80.2707 },
            verificationSessionToken: rawToken
          })
        });

      // Fire 2 concurrent requests
      const [res1, res2] = await Promise.all([makeRequest(), makeRequest()]);
      const statuses = [res1.status, res2.status].sort();

      // Exactly one 200, exactly one 403
      assert.deepEqual(statuses, [200, 403]);
    });
  });
});
