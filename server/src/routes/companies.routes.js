import express from "express";
import {
  getCompanies,
  getCompanyBySlug,
  createCompany,
  updateCompany,
  getCompanyDomains,
  addCompanyDomain,
  deleteCompanyDomain,
  verifyCompanyDomain
} from "../controllers/companyController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", getCompanies);
router.get("/slug/:slug", getCompanyBySlug);
router.get("/domains", getCompanyDomains);
router.post("/domains", authenticateToken, addCompanyDomain);
router.delete("/domains/:domain", authenticateToken, deleteCompanyDomain);
router.delete("/domains", authenticateToken, deleteCompanyDomain);
router.post("/domains/:domain/verify", authenticateToken, verifyCompanyDomain);
router.post("/domains/verify", authenticateToken, verifyCompanyDomain);
router.post("/", authenticateToken, createCompany);
router.patch("/:id", authenticateToken, updateCompany);
router.put("/:id", authenticateToken, updateCompany);

export default router;
