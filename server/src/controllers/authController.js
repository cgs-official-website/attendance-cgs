import bcrypt from "bcryptjs";
import { query } from "../config/db.js";
import { generateToken } from "../middlewares/auth.js";
import { sendWelcomeEmail } from "../services/emailService.js";

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials. User not found." });
    }

    const user = result.rows[0];

    // If password_hash exists, verify it. If not set yet (fresh migration), allow first-time password set.
    if (user.password_hash) {
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: "Invalid password." });
      }
    } else {
      // First login after migration from Firebase: hash and save new password
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      await query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, user.id]);
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
