import crypto from "crypto";
import { query } from "../config/db.js";
import { extractRequestMetadata } from "../utils/deviceDetector.js";

let socketIoInstance = null;

export const setSecuritySocketIO = (io) => {
  socketIoInstance = io;
};

// In-memory rapid tracker for brute force attempts (backed by DB audit queries)
const failedAttemptsMap = new Map(); // key: ip or email -> { count, firstAttempt }

class SecurityDetector {
  /**
   * Broadcast an alert in real time to connected admin socket clients
   */
  broadcastAlert(alert) {
    try {
      if (socketIoInstance) {
        socketIoInstance.emit("security_alert", alert);
      }
    } catch (err) {
      console.warn("Could not broadcast security alert via socket:", err.message);
    }
  }

  /**
   * Record a failed login attempt and detect brute force attacks
   */
  async recordFailedLogin(email, req) {
    const meta = extractRequestMetadata(req);
    const cleanEmail = (email || "unknown").toLowerCase().trim();
    const ip = meta.ipAddress;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes window

    // 1. In-memory check
    const trackerKey = `${cleanEmail}:${ip}`;
    let tracker = failedAttemptsMap.get(trackerKey);
    if (!tracker || now - tracker.firstAttempt > windowMs) {
      tracker = { count: 1, firstAttempt: now };
    } else {
      tracker.count += 1;
    }
    failedAttemptsMap.set(trackerKey, tracker);

    // 2. Check DB audit logs for recent failed attempts
    let totalRecentFailures = tracker.count;
    try {
      const dbCheck = await query(
        `SELECT COUNT(*) AS failed_count 
         FROM audit_logs 
         WHERE action = 'AUTH_LOGIN_FAILED' 
           AND (ip_address = $1 OR details->>'email' = $2)
           AND created_at >= NOW() - INTERVAL '15 minutes'`,
        [ip, cleanEmail]
      );
      const dbCount = parseInt(dbCheck.rows[0]?.failed_count || 0, 10);
      totalRecentFailures = Math.max(tracker.count, dbCount + 1);
    } catch (_) {}

    // If failures exceed threshold, trigger high severity alert
    if (totalRecentFailures >= 5) {
      const alertId = crypto.randomUUID();
      const description = `Brute force alert: ${totalRecentFailures} failed login attempts for account '${cleanEmail}' from IP ${ip}.`;

      try {
        const insertRes = await query(
          `INSERT INTO security_alerts (
            id, user_id, alert_type, severity, description, metadata, is_resolved, created_at
          ) VALUES ($1, NULL, $2, $3, $4, $5::jsonb, FALSE, CURRENT_TIMESTAMP)
          RETURNING *`,
          [
            alertId,
            "BRUTE_FORCE_ATTEMPT",
            "HIGH",
            description,
            JSON.stringify({
              email: cleanEmail,
              ipAddress: ip,
              userAgent: meta.userAgent,
              device: meta.deviceName,
              attemptCount: totalRecentFailures
            })
          ]
        );

        const newAlert = insertRes.rows[0];
        this.broadcastAlert(newAlert);
      } catch (err) {
        console.error("Failed to persist security alert:", err.message);
      }
    }
  }

  /**
   * Check for impossible travel / rapid geographical or subnet hops
   */
  async checkImpossibleTravel(userId, currentIp, req) {
    if (!userId || !currentIp || currentIp === "127.0.0.1") return;

    try {
      // Find the most recent previous session / login for this user
      const prevRes = await query(
        `SELECT ip_address, created_at, device_name 
         FROM user_sessions 
         WHERE user_id = $1 
           AND ip_address IS NOT NULL 
           AND ip_address != '127.0.0.1'
           AND ip_address != $2
           AND created_at >= NOW() - INTERVAL '3 hours'
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId, currentIp]
      );

      if (prevRes.rows.length > 0) {
        const prev = prevRes.rows[0];
        const minutesDiff = (Date.now() - new Date(prev.created_at).getTime()) / (1000 * 60);

        // Subnet check (first two octets differ)
        const curParts = currentIp.split(".");
        const prevParts = prev.ip_address.split(".");
        const isDifferentSubnet = curParts.length === 4 && prevParts.length === 4 && (curParts[0] !== prevParts[0] || curParts[1] !== prevParts[1]);

        if (isDifferentSubnet && minutesDiff < 30) {
          const alertId = crypto.randomUUID();
          const description = `Impossible Travel: User active from IP ${prev.ip_address} and IP ${currentIp} within ${Math.round(minutesDiff)} minutes.`;

          const insertRes = await query(
            `INSERT INTO security_alerts (
              id, user_id, alert_type, severity, description, metadata, is_resolved, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, FALSE, CURRENT_TIMESTAMP)
            RETURNING *`,
            [
              alertId,
              userId,
              "IMPOSSIBLE_TRAVEL",
              "MEDIUM",
              description,
              JSON.stringify({
                userId,
                previousIp: prev.ip_address,
                currentIp,
                timeDifferenceMinutes: Math.round(minutesDiff)
              })
            ]
          );

          this.broadcastAlert(insertRes.rows[0]);
        }
      }
    } catch (err) {
      console.warn("Impossible travel check warning:", err.message);
    }
  }

  /**
   * Detect anomalous behavior like attendance edits during midnight / off-hours
   */
  async checkSuspiciousAction({ userId, action, resourceType, details = {}, req = null }) {
    try {
      const now = new Date();
      const currentHour = now.getHours(); // 0 to 23

      // Flag manual attendance adjustments between 11 PM and 5 AM
      if (resourceType === "attendance" && (action === "ATTENDANCE_EDIT" || action === "ATTENDANCE_MANUAL_OVERRIDE")) {
        if (currentHour >= 23 || currentHour <= 5) {
          const alertId = crypto.randomUUID();
          const description = `Anomalous after-hours attendance edit executed at ${now.toLocaleTimeString()} by user.`;

          const insertRes = await query(
            `INSERT INTO security_alerts (
              id, user_id, alert_type, severity, description, metadata, is_resolved, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, FALSE, CURRENT_TIMESTAMP)
            RETURNING *`,
            [
              alertId,
              userId,
              "AFTER_HOURS_ATTENDANCE_EDIT",
              "LOW",
              description,
              JSON.stringify({ action, resourceType, details, hour: currentHour })
            ]
          );

          this.broadcastAlert(insertRes.rows[0]);
        }
      }
    } catch (err) {
      console.warn("Suspicious action check warning:", err.message);
    }
  }

  /**
   * Retrieve list of security alerts
   */
  async getSecurityAlerts({ page = 1, limit = 20, isResolved = null, severity = null } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];
    let p = 1;

    if (isResolved !== null && isResolved !== undefined) {
      conditions.push(`is_resolved = $${p++}`);
      params.push(isResolved === "true" || isResolved === true);
    }
    if (severity) {
      conditions.push(`severity = $${p++}`);
      params.push(severity.toUpperCase());
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRes = await query(`SELECT COUNT(*) AS total FROM security_alerts ${where}`, params);
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    const listRes = await query(
      `SELECT sa.*, u.name as user_name, u.email as user_email 
       FROM security_alerts sa
       LEFT JOIN users u ON sa.user_id = u.id
       ${where}
       ORDER BY sa.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, limitNum, offset]
    );

    return {
      alerts: listRes.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId) {
    const res = await query(
      "UPDATE security_alerts SET is_resolved = TRUE WHERE id = $1 RETURNING *",
      [alertId]
    );
    return res.rows[0] || null;
  }

  /**
   * High-level security metrics
   */
  async getSecurityStats() {
    try {
      const [sessionsRes, alertsRes, todayAuditRes] = await Promise.all([
        query("SELECT COUNT(*) AS active_sessions FROM user_sessions WHERE is_revoked = FALSE AND (expires_at IS NULL OR expires_at > NOW())"),
        query("SELECT COUNT(*) AS unresolved_alerts FROM security_alerts WHERE is_resolved = FALSE"),
        query("SELECT COUNT(*) AS events_today FROM audit_logs WHERE created_at >= CURRENT_DATE")
      ]);

      return {
        activeSessions: parseInt(sessionsRes.rows[0]?.active_sessions || 0, 10),
        unresolvedAlerts: parseInt(alertsRes.rows[0]?.unresolved_alerts || 0, 10),
        eventsToday: parseInt(todayAuditRes.rows[0]?.events_today || 0, 10)
      };
    } catch (err) {
      console.error("Error fetching security stats:", err);
      return { activeSessions: 0, unresolvedAlerts: 0, eventsToday: 0 };
    }
  }
}

export const securityDetector = new SecurityDetector();
export default securityDetector;
