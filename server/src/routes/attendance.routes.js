import express from "express";
import { getAttendance, checkIn, checkOut } from "../controllers/attendanceController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/", getAttendance);
router.post("/check-in", checkIn);
router.post("/check-out", checkOut);

export default router;
