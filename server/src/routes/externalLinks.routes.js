import express from "express";
import {
  getExternalLinks,
  getExternalLinkByToken,
  createExternalLink,
  revokeExternalLink
} from "../controllers/externalLinkController.js";
import { authenticateToken, optionalAuth } from "../middlewares/auth.js";

const router = express.Router();

// Public endpoint for clients to view chat by token
router.get("/token/:token", getExternalLinkByToken);

// Admin/PM endpoints
router.get("/", optionalAuth, getExternalLinks);
router.post("/", optionalAuth, createExternalLink);
router.patch("/:id/revoke", optionalAuth, revokeExternalLink);
router.delete("/:id", optionalAuth, revokeExternalLink);

export default router;
