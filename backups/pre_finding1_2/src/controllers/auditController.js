import auditService from "../services/auditService.js";
import securityDetector from "../services/securityDetector.js";

/**
 * Controller for Admin Audit Logs & Security Alerts
 */
export const getAuditLogs = async (req, res) => {
  try {
    const {
      page,
      limit,
      action,
      resourceType,
      userId,
      status,
      search,
      startDate,
      endDate
    } = req.query;

    const companyId = req.user.companyId || null;

    const data = await auditService.getAuditLogs({
      page,
      limit,
      action,
      resourceType,
      userId,
      status,
      search,
      startDate,
      endDate,
      companyId: req.user.role?.toLowerCase() === "superadmin" ? null : companyId
    });

    res.json(data);
  } catch (err) {
    console.error("Error retrieving audit logs:", err);
    res.status(500).json({ error: "Failed to retrieve audit logs." });
  }
};

export const getSecurityAlerts = async (req, res) => {
  try {
    const { page, limit, isResolved, severity } = req.query;
    const data = await securityDetector.getSecurityAlerts({
      page,
      limit,
      isResolved,
      severity
    });
    res.json(data);
  } catch (err) {
    console.error("Error retrieving security alerts:", err);
    res.status(500).json({ error: "Failed to retrieve security alerts." });
  }
};

export const resolveSecurityAlert = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Alert ID is required." });
    }

    const alert = await securityDetector.resolveAlert(id);
    if (!alert) {
      return res.status(404).json({ error: "Security alert not found." });
    }

    auditService.logAudit({
      userId: req.user.id,
      action: "SECURITY_ALERT_RESOLVED",
      resourceType: "security_alert",
      resourceId: id,
      details: { alertType: alert.alert_type, resolvedBy: req.user.email },
      req
    });

    res.json({
      success: true,
      alert,
      message: "Security alert resolved successfully."
    });
  } catch (err) {
    console.error("Error resolving security alert:", err);
    res.status(500).json({ error: "Failed to resolve security alert." });
  }
};

export const getSecurityStats = async (req, res) => {
  try {
    const stats = await securityDetector.getSecurityStats();
    res.json(stats);
  } catch (err) {
    console.error("Error retrieving security stats:", err);
    res.status(500).json({ error: "Failed to retrieve security statistics." });
  }
};
