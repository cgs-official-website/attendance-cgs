import express from "express";
import { getActiveSessions, revokeSession, revokeOtherSessions } from "../controllers/sessionController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

// All session routes require authentication
router.use(authenticateToken);

router.get("/active", getActiveSessions);
router.post("/revoke", revokeSession);
router.post("/revoke-others", revokeOtherSessions);

export default router;
