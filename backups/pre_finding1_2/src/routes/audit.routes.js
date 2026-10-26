import express from "express";
import {
  getAuditLogs,
  getSecurityAlerts,
  resolveSecurityAlert,
  getSecurityStats
} from "../controllers/auditController.js";
import { authenticateToken, requireAdmin } from "../middlewares/auth.js";

const router = express.Router();

// Admin-only endpoints for security and audit oversight
router.use(authenticateToken);
router.use(requireAdmin);

router.get("/audit-logs", getAuditLogs);
router.get("/security-alerts", getSecurityAlerts);
router.patch("/security-alerts/:id/resolve", resolveSecurityAlert);
router.get("/security-stats", getSecurityStats);

export default router;
