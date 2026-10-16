import express from "express";
import { login, register, getMe, forgotPassword, confirmResetPassword, verifyOtp, resendOtp } from "../controllers/authController.js";
import { authenticateToken } from "../middlewares/auth.js";
import { authRateLimiter, passwordResetRateLimiter } from "../middlewares/rateLimiter.js";

const router = express.Router();

router.post("/login", authRateLimiter, login);
router.post("/verify-otp", authRateLimiter, verifyOtp);
router.post("/resend-otp", authRateLimiter, resendOtp);
router.post("/register", authRateLimiter, register);
router.post("/reset-password", passwordResetRateLimiter, forgotPassword);
router.post("/forgot-password", passwordResetRateLimiter, forgotPassword);
router.post("/confirm-reset-password", passwordResetRateLimiter, confirmResetPassword);
router.get("/me", authenticateToken, getMe);

export default router;

