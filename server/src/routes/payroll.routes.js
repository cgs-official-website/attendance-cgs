import express from "express";
import {
  getPayroll,
  savePayroll,
  deletePayroll
} from "../controllers/payrollController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/", getPayroll);
router.post("/", savePayroll);
router.delete("/:id", deletePayroll);

export default router;
