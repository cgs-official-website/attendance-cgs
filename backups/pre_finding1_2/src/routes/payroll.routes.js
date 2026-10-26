import express from "express";
import {
  getPayroll,
  savePayroll,
  deletePayroll,
  wipeAllPayrolls,
  calculatePayrollBatch,
  approvePayrollBatch
} from "../controllers/payrollController.js";
import { authenticateToken, requireAdmin } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/", getPayroll);
router.post("/", requireAdmin, savePayroll);
router.post("/calculate", requireAdmin, calculatePayrollBatch);
router.post("/approve", requireAdmin, approvePayrollBatch);
router.delete("/all", requireAdmin, wipeAllPayrolls);
router.delete("/:id", requireAdmin, deletePayroll);
router.delete("/", requireAdmin, deletePayroll);

export default router;


