import crypto from "crypto";
import { query } from "../config/db.js";
import { extractRequestMetadata } from "../utils/deviceDetector.js";

/**
 * Non-blocking, fault-tolerant Audit Logging Service
 */
class AuditService {
  /**
   * Log an event asynchronously without blocking or throwing errors to the caller.
   */
  logAudit({
    userId = null,
    userEmail = null,
    userName = null,
    userRole = null,
    companyId = null,
    action,
    resourceType = "system",
    resourceId = null,
    details = {},
    ipAddress = null,
    userAgent = null,
    status = "SUCCESS",
    severity = "INFO",
    req = null
  }) {
    // Run entirely detached in next tick to avoid blocking the main transaction
    setImmediate(async () => {
      try {
        let finalIp = ipAddress;
        let finalUa = userAgent;

        if (req) {
          const meta = extractRequestMetadata(req);
          if (!finalIp) finalIp = meta.ipAddress;
          if (!finalUa) finalUa = meta.userAgent;
          if (!userId && req.user?.id) userId = req.user.id;
          if (!userEmail && req.user?.email) userEmail = req.user.email;
          if (!userName && req.user?.name) userName = req.user.name;
          if (!userRole && req.user?.role) userRole = req.user.role;
          if (!companyId && req.user?.companyId) companyId = req.user.companyId;
        }

        // If user details are still missing but we have userId, look up once
        if (userId && (!userEmail || !userName)) {
          try {
            const userRes = await query("SELECT email, name, role, company_id FROM users WHERE id = $1 LIMIT 1", [userId]);
            if (userRes.rows.length > 0) {
              const u = userRes.rows[0];
              if (!userEmail) userEmail = u.email;
              if (!userName) userName = u.name;
              if (!userRole) userRole = u.role;
              if (!companyId) companyId = u.company_id;
            }
          } catch (_) {
            // Ignore lookup failure
          }
        }

        const id = crypto.randomUUID();
        const jsonDetails = typeof details === "object" ? JSON.stringify(details) : JSON.stringify({ message: String(details) });

        await query(
          `INSERT INTO audit_logs (
            id, user_id, user_email, user_name, user_role, company_id,
            action, resource, resource_type, resource_id, details,
            ip_address, user_agent, status, severity, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, CURRENT_TIMESTAMP)`,
          [
            id,
            userId || null,
            userEmail || null,
            userName || null,
            userRole || null,
            companyId || null,
            action,
            resourceType,
            resourceType,
            resourceId ? String(resourceId) : null,
            jsonDetails,
            finalIp || null,
            finalUa || null,
            status,
            severity
          ]
        );
      } catch (err) {
        // Never throw; log internally
        console.error("⚠️ Audit log background write error (non-fatal):", err.message);
      }
    });
  }

  /**
   * Query paginated audit logs with search and filters
   */
  async getAuditLogs({
    page = 1,
    limit = 20,
    action = null,
    resourceType = null,
    userId = null,
    status = null,
    search = null,
    startDate = null,
    endDate = null,
    companyId = null
  } = {}) {
    try {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const conditions = [];
      const params = [];
      let paramIndex = 1;

      if (action) {
        conditions.push(`action = $${paramIndex++}`);
        params.push(action);
      }
      if (resourceType) {
        conditions.push(`(resource_type = $${paramIndex} OR resource = $${paramIndex})`);
        paramIndex++;
        params.push(resourceType);
      }
      if (userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        params.push(userId);
      }
      if (status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(status);
      }
      if (companyId) {
        conditions.push(`(company_id = $${paramIndex} OR company_id IS NULL)`);
        paramIndex++;
        params.push(companyId);
      }
      if (startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(startDate);
      }
      if (endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(endDate);
      }
      if (search) {
        const searchPattern = `%${search.trim()}%`;
        conditions.push(`(
          action ILIKE $${paramIndex} OR 
          user_email ILIKE $${paramIndex} OR 
          user_name ILIKE $${paramIndex} OR 
          ip_address ILIKE $${paramIndex} OR 
          COALESCE(resource_type, resource, '') ILIKE $${paramIndex}
        )`);
        paramIndex++;
        params.push(searchPattern);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countSql = `SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`;
      const countRes = await query(countSql, params);
      const totalCount = parseInt(countRes.rows[0]?.total || 0, 10);

      const listSql = `
        SELECT 
          id, user_id, user_email, user_name, user_role, company_id,
          action, COALESCE(resource_type, resource) AS resource_type,
          resource_id, details, ip_address, user_agent, status, severity, created_at
        FROM audit_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      const listRes = await query(listSql, [...params, limitNum, offset]);

      return {
        logs: listRes.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum)
        }
      };
    } catch (err) {
      console.error("Error fetching audit logs:", err);
      throw err;
    }
  }
}

export const auditService = new AuditService();
export default auditService;
