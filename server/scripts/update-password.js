import bcrypt from "bcryptjs";
import { query } from "../src/config/db.js";

async function setPassword() {
  const email = "mohamed.naveeth@teamcarrezza.com".toLowerCase().trim();
  const rawPassword = "Samwilliams@675";

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(rawPassword, salt);

  console.log(`Generated bcrypt hash for ${email}`);

  // Check if user exists
  const checkRes = await query("SELECT id, name, email FROM users WHERE email = $1", [email]);

  if (checkRes.rows.length > 0) {
    const user = checkRes.rows[0];
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, user.id]);
    console.log(`Successfully updated password for existing user: ${user.name} (${email})`);
  } else {
    // Create new user if not present
    const userId = "usr_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    await query(
      `INSERT INTO users (id, company_id, email, password_hash, name, role, department, designation, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        "carrezza-global-solutions",
        email,
        passwordHash,
        "Mohamed Naveeth",
        "employee",
        "Engineering",
        "Software Engineer",
        "active"
      ]
    );
    console.log(`Created new user with password hash: Mohamed Naveeth (${email})`);
  }

  // Verify compare
  const verifyRes = await query("SELECT password_hash FROM users WHERE email = $1", [email]);
  const isMatch = await bcrypt.compare(rawPassword, verifyRes.rows[0].password_hash);
  console.log(`Verification check: bcrypt.compare("${rawPassword}", hash) === ${isMatch}`);

  process.exit(0);
}

setPassword().catch(err => {
  console.error("Error setting password:", err);
  process.exit(1);
});
