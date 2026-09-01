import express from "express";
import {
  getCompanies,
  getCompanyBySlug,
  createCompany,
  updateCompany,
  getCompanyDomains
} from "../controllers/companyController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", getCompanies);
router.get("/slug/:slug", getCompanyBySlug);
router.get("/domains", getCompanyDomains);
router.post("/", authenticateToken, createCompany);
router.patch("/:id", authenticateToken, updateCompany);
router.put("/:id", authenticateToken, updateCompany);

export default router;
