import { query } from "../src/config/db.js";

export async function runGeofenceDefaultsMigration() {
  console.log("🚀 Running migration: Fixing geofencing defaults and company isolation...");
  
  // 1. Drop the misleading column default of 100.00 from companies.allowed_radius_meters
  await query(`ALTER TABLE companies ALTER COLUMN allowed_radius_meters DROP DEFAULT;`);
  console.log("✅ Dropped DEFAULT constraint from companies.allowed_radius_meters.");

  // 2. Set allowed_radius_meters to NULL for companies that have no coordinates configured
  await query(`
    UPDATE companies 
    SET allowed_radius_meters = NULL 
    WHERE latitude IS NULL AND longitude IS NULL;
  `);
  console.log("✅ Cleared default radius for companies without configured office coordinates.");

  console.log("✅ Migration successful: Geofence defaults verified.");
}

// Allow direct CLI execution
if (process.argv[1] && process.argv[1].endsWith("migrate-geofence-defaults.js")) {
  runGeofenceDefaultsMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Migration failed:", err);
      process.exit(1);
    });
}
