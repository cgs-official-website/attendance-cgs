import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { generateToken } from "../middlewares/auth.js";
import { sendWelcomeEmail, sendPasswordResetEmail } from "../services/emailService.js";

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const result = await query(
      "SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER($1) ORDER BY (password_hash IS NOT NULL) DESC, created_at DESC LIMIT 1",
      [cleanEmail]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials. User not found." });
    }

    const user = result.rows[0];

    // If password_hash does not exist, require user to set a password via Forgot Password
    if (!user.password_hash) {
      return res.status(401).json({ error: "Password has not been set for this account. Please use 'Forgot password?' to set your password." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid password." });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.company_id
    });

    const { password_hash, ...userProfile } = user;
    res.json({ token, user: userProfile });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error during login." });
  }
};

export const register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      department,
      designation,
      programType,
      shiftStart,
      shiftEnd,
      companyId,
      role = "employee",
      employeeId
    } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    const existing = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "User with this email already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = "usr_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

    const insertRes = await query(
      `INSERT INTO users (
         id, name, email, password_hash, department, designation, program_type,
         shift_start, shift_end, company_id, role, employee_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, name, email, role, department, company_id, created_at`,
      [
        userId,
        name,
        email.toLowerCase().trim(),
        passwordHash,
        department || null,
        designation || null,
        programType || "Full-time",
        shiftStart || "09:00",
        shiftEnd || "18:00",
        companyId || null,
        role,
        employeeId || null
      ]
    );

    const newUser = insertRes.rows[0];
    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      companyId: newUser.company_id
    });

    // Send welcome email asynchronously
    sendWelcomeEmail({
      email: newUser.email,
      name: newUser.name,
      employeeId: employeeId || null,
      shiftStart: shiftStart || "09:00",
      shiftEnd: shiftEnd || "18:00",
      role: newUser.role
    }).catch(e => console.error("Error sending welcome email:", e));

    res.status(201).json({ token, user: newUser });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Internal server error during registration." });
  }
};

export const getMe = async (req, res) => {
  try {
    const result = await query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    const { password_hash, ...userProfile } = result.rows[0];
    res.json({ user: userProfile });
  } catch (err) {
    console.error("getMe error:", err);
    res.status(500).json({ error: "Failed to fetch user profile." });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const result = await query(
      "SELECT id, name, email FROM users WHERE LOWER(TRIM(email)) = LOWER($1) ORDER BY (password_hash IS NOT NULL) DESC, created_at DESC LIMIT 1",
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No account found with this email address." });
    }

    const user = result.rows[0];
    const jwtSecret = process.env.JWT_SECRET || "hrms_jwt_super_secret_railway_2026";

    // Generate a reset token valid for 30 minutes
    const resetToken = jwt.sign(
      { id: user.id, email: user.email, type: "password_reset" },
      jwtSecret,
      { expiresIn: "30m" }
    );

    // Determine client base URL dynamically
    const origin = req.headers.origin || req.headers.referer;
    let baseUrl = process.env.APP_URL || "https://attendance-cgs.vercel.app";
    if (origin) {
      try {
        const parsed = new URL(origin);
        baseUrl = parsed.origin;
      } catch (e) {
        // use default baseUrl
      }
    }

    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    const emailResult = await sendPasswordResetEmail({
      email: user.email,
      name: user.name,
      resetToken,
      resetUrl
    });

    if (!emailResult.success && emailResult.reason === "SMTP_NOT_CONFIGURED") {
      return res.status(500).json({ error: "Email service is not configured on the server." });
    }

    if (!emailResult.success) {
      return res.status(500).json({ error: emailResult.error || "Failed to deliver reset email." });
    }

    res.json({ message: "Password reset email sent successfully. Please check your inbox." });
  } catch (err) {
    console.error("forgotPassword error:", err);
    res.status(500).json({ error: "Internal server error while processing password reset." });
  }
};

export const confirmResetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const jwtSecret = process.env.JWT_SECRET || "hrms_jwt_super_secret_railway_2026";
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      return res.status(400).json({ error: "Password reset link is invalid or has expired. Please request a new one." });
    }

    if (decoded.type !== "password_reset" || !decoded.id) {
      return res.status(400).json({ error: "Invalid password reset token." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const updateRes = await query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 OR LOWER(TRIM(email)) = LOWER($3) RETURNING id, email, name",
      [passwordHash, decoded.id, decoded.email]
    );
    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ message: "Password has been successfully reset. You can now log in with your new password." });
  } catch (err) {
    console.error("confirmResetPassword error:", err);
    res.status(500).json({ error: "Internal server error while resetting password." });
  }
};

