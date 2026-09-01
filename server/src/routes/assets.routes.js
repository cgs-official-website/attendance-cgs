import express from "express";
import {
  getAssets,
  createAsset,
  updateAsset,
  deleteAsset
} from "../controllers/assetController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/", getAssets);
router.post("/", createAsset);
router.patch("/:id", updateAsset);
router.delete("/:id", deleteAsset);

export default router;
