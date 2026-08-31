import express from "express";
import { login, register, getMe } from "../controllers/authController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.post("/login", login);
router.post("/register", register);
router.get("/me", authenticateToken, getMe);

export default router;
