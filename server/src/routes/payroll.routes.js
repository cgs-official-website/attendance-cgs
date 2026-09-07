import express from "express";
import {
  getPayroll,
  savePayroll,
  deletePayroll,
  wipeAllPayrolls
} from "../controllers/payrollController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/", getPayroll);
router.post("/", savePayroll);
router.delete("/all", wipeAllPayrolls);
router.delete("/:id", deletePayroll);
router.delete("/", deletePayroll);

export default router;

