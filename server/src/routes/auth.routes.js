import express from "express";
import { login, register, getMe, forgotPassword, confirmResetPassword } from "../controllers/authController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.post("/login", login);
router.post("/register", register);
router.post("/reset-password", forgotPassword);
router.post("/forgot-password", forgotPassword);
router.post("/confirm-reset-password", confirmResetPassword);
router.get("/me", authenticateToken, getMe);

export default router;
