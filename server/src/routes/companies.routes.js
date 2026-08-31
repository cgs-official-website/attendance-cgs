import express from "express";
import { getCompanies, getCompanyBySlug, createCompany, getRoles, getEnvironmentSettings } from "../controllers/companyController.js";
import { authenticateToken, requireAdmin } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", getCompanies);
router.get("/slug/:slug", getCompanyBySlug);
router.post("/", authenticateToken, requireAdmin, createCompany);
router.get("/roles", authenticateToken, getRoles);
router.get("/settings", authenticateToken, getEnvironmentSettings);

export default router;
