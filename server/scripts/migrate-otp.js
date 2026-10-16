import { query } from "../src/config/db.js";

export async function runOtpMigration() {
  console.log("🚀 Running migration: Creating login_otps table...");
  await query(`
    CREATE TABLE IF NOT EXISTS login_otps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INT DEFAULT 0,
      resend_count INT DEFAULT 0,
      last_sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      is_used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_login_otps_user_id ON login_otps(user_id);
  `);
  console.log("✅ Migration successful: login_otps table verified.");
}

// Allow direct CLI execution
if (process.argv[1] && process.argv[1].endsWith("migrate-otp.js")) {
  runOtpMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Migration failed:", err);
      process.exit(1);
    });
}
