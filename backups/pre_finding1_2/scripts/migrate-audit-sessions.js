import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "../src/config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runAuditSessionMigration() {
  console.log("🚀 Running migration: Creating user_sessions, audit_logs, and security_alerts...");
  const sqlPath = path.resolve(__dirname, "../src/database/migrations/001_audit_and_sessions.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  await query(sql);
  console.log("✅ Migration successful: user_sessions, audit_logs, and security_alerts tables verified!");
}

if (process.argv[1] && process.argv[1].endsWith("migrate-audit-sessions.js")) {
  runAuditSessionMigration()
    .then(() => {
      console.log("Migration finished successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Migration failed:", err);
      process.exit(1);
    });
}
