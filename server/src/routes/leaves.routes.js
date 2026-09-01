import express from "express";
import {
  getLeaveRequests,
  createLeaveRequest,
  updateLeaveStatus,
  deleteLeaveRequest,
  getPaidLeaves,
  createPaidLeave,
  deletePaidLeave
} from "../controllers/leaveController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/", getLeaveRequests);
router.post("/", createLeaveRequest);
router.patch("/:id/status", updateLeaveStatus);
router.delete("/:id", deleteLeaveRequest);

// Paid Leaves subroutes
router.get("/paid", getPaidLeaves);
router.post("/paid", createPaidLeave);
router.delete("/paid/:id", deletePaidLeave);

export default router;
