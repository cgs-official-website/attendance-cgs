import express from "express";
import { getLeaveRequests, createLeaveRequest, updateLeaveStatus } from "../controllers/leaveController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/", getLeaveRequests);
router.post("/", createLeaveRequest);
router.patch("/:id/status", updateLeaveStatus);

export default router;
