import crypto from "crypto";
import { query } from "../config/db.js";
import { extractRequestMetadata } from "../utils/deviceDetector.js";
import auditService from "./auditService.js";

class SessionService {
  /**
   * Create an active session and persist device fingerprint
   */
  async createSession(userId, req, options = {}) {
    try {
      const sessionId = crypto.randomUUID();
      const meta = extractRequestMetadata(req);
      const expiresInDays = options.expiresInDays || 30;
      const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

      // Fetch user profile info to store in session record
      let userEmail = null;
      let userName = null;
      let userRole = null;
      let companyId = null;

      try {
        const uRes = await query("SELECT email, name, role, company_id FROM users WHERE id = $1 LIMIT 1", [userId]);
        if (uRes.rows.length > 0) {
          const u = uRes.rows[0];
          userEmail = u.email;
          userName = u.name;
          userRole = u.role;
          companyId = u.company_id;
        }
      } catch (_) {}

      const deviceInfo = {
        browser: meta.browser,
        os: meta.os,
        deviceType: meta.deviceType,
        deviceName: meta.deviceName
      };

      const insertSql = `
        INSERT INTO user_sessions (
          id, user_id, session_id, user_email, user_name, user_role, company_id,
          ip_address, user_agent, device_info, device_name, browser, os,
          is_revoked, revoked, is_active, login_at, last_active_at, expires_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10::jsonb, $11, $12, $13,
          FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $14, CURRENT_TIMESTAMP
        ) RETURNING *
      `;

      const result = await query(insertSql, [
        sessionId,
        userId,
        sessionId,
        userEmail,
        userName,
        userRole,
        companyId,
        meta.ipAddress,
        meta.userAgent,
        JSON.stringify(deviceInfo),
        meta.deviceName,
        meta.browser,
        meta.os,
        expiresAt
      ]);

      const session = result.rows[0];

      return {
        sessionId,
        expiresAt,
        deviceInfo,
        ipAddress: meta.ipAddress
      };
    } catch (err) {
      console.error("Error creating session in DB:", err);
      // Fallback: return a valid session object even if DB insert hit an issue so user login does not break
      return {
        sessionId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        deviceInfo: extractRequestMetadata(req),
        ipAddress: req?.ip || "127.0.0.1"
      };
    }
  }

  /**
   * Validate a session by sessionId (extracted from JWT)
   */
  async validateSession(sessionId) {
    if (!sessionId) return { valid: false, reason: "No session ID provided" };

    try {
      const res = await query(
        `SELECT * FROM user_sessions 
         WHERE (session_id = $1 OR id = $1)
         LIMIT 1`,
        [sessionId]
      );

      if (res.rows.length === 0) {
        return { valid: false, reason: "Session not found" };
      }

      const session = res.rows[0];

      // Check if revoked
      if (session.is_revoked || session.revoked) {
        return { valid: false, reason: "Session has been revoked", code: "SESSION_REVOKED" };
      }

      // Check expiration
      if (session.expires_at && new Date() > new Date(session.expires_at)) {
        return { valid: false, reason: "Session has expired", code: "SESSION_EXPIRED" };
      }

      // Throttled update of last_active_at (update at most once every 2 minutes)
      const lastActive = session.last_active_at ? new Date(session.last_active_at).getTime() : 0;
      const now = Date.now();
      if (now - lastActive > 2 * 60 * 1000) {
        setImmediate(async () => {
          try {
            await query(
              "UPDATE user_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE session_id = $1 OR id = $1",
              [sessionId]
            );
          } catch (_) {}
        });
      }

      return { valid: true, session };
    } catch (err) {
      console.error("Error validating session:", err);
      // Fail-open on DB error so active users don't get abruptly locked out
      return { valid: true, error: err.message };
    }
  }

  /**
   * Revoke a single session
   */
  async revokeSession(sessionId, userId, revokedBy = null, reason = "User initiated logout") {
    try {
      const sql = `
        UPDATE user_sessions
        SET 
          is_revoked = TRUE, 
          revoked = TRUE, 
          is_active = FALSE,
          logout_at = CURRENT_TIMESTAMP,
          revoked_at = CURRENT_TIMESTAMP,
          revoked_by = $3,
          revoke_reason = $4
        WHERE (session_id = $1 OR id = $1) AND (user_id = $2 OR $2 IS NULL)
        RETURNING *
      `;

      const res = await query(sql, [sessionId, userId || null, revokedBy || userId, reason]);

      if (res.rows.length > 0) {
        const revoked = res.rows[0];
        auditService.logAudit({
          userId: revoked.user_id,
          action: "SESSION_REVOKED",
          resourceType: "session",
          resourceId: sessionId,
          details: { reason, device: revoked.device_name || revoked.browser, ip: revoked.ip_address }
        });
      }

      return res.rows.length > 0;
    } catch (err) {
      console.error("Error revoking session:", err);
      throw err;
    }
  }

  /**
   * Revoke all other active sessions for user
   */
  async revokeAllOtherSessions(userId, currentSessionId) {
    try {
      const sql = `
        UPDATE user_sessions
        SET 
          is_revoked = TRUE,
          revoked = TRUE,
          is_active = FALSE,
          logout_at = CURRENT_TIMESTAMP,
          revoked_at = CURRENT_TIMESTAMP,
          revoked_by = $1,
          revoke_reason = 'Terminated via remote logout all'
        WHERE user_id = $1 
          AND (session_id != $2 AND id != $2)
          AND (is_revoked = FALSE OR is_revoked IS NULL)
        RETURNING id, session_id, device_name, ip_address
      `;

      const res = await query(sql, [userId, currentSessionId]);

      auditService.logAudit({
        userId,
        action: "SESSION_REVOKED_ALL_OTHERS",
        resourceType: "session",
        resourceId: currentSessionId,
        details: { count: res.rows.length, revokedSessions: res.rows.map(r => r.session_id || r.id) }
      });

      return { revokedCount: res.rows.length };
    } catch (err) {
      console.error("Error revoking other sessions:", err);
      throw err;
    }
  }

  /**
   * Retrieve all active sessions for a user
   */
  async getUserActiveSessions(userId, currentSessionId = null) {
    try {
      const sql = `
        SELECT 
          id, session_id, device_name, browser, os, ip_address, 
          device_info, login_at, last_active_at, expires_at, created_at,
          COALESCE(is_revoked, revoked, FALSE) AS is_revoked
        FROM user_sessions
        WHERE user_id = $1
          AND (is_revoked = FALSE OR is_revoked IS NULL)
          AND (revoked = FALSE OR revoked IS NULL)
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY last_active_at DESC NULLS LAST, created_at DESC
      `;

      const res = await query(sql, [userId]);

      return res.rows.map(s => {
        const sid = s.session_id || s.id;
        const isCurrent = Boolean(currentSessionId && (currentSessionId === sid || currentSessionId === s.id));
        return {
          id: s.id,
          sessionId: sid,
          deviceName: s.device_name || (s.device_info?.deviceName) || `${s.browser || "Browser"} on ${s.os || "Device"}`,
          browser: s.browser || s.device_info?.browser || "Unknown",
          os: s.os || s.device_info?.os || "Unknown",
          deviceType: s.device_info?.deviceType || "Desktop",
          ipAddress: s.ip_address || "Unknown",
          lastActiveAt: s.last_active_at || s.created_at,
          createdAt: s.created_at || s.login_at,
          expiresAt: s.expires_at,
          isCurrent
        };
      });
    } catch (err) {
      console.error("Error retrieving active sessions:", err);
      throw err;
    }
  }
}

export const sessionService = new SessionService();
export default sessionService;
