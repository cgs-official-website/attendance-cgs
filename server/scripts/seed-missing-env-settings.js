import { query } from "../src/config/db.js";

async function main() {
  console.log("Checking companies missing default environment settings...");
  const companies = await query("SELECT id, name FROM companies");

  const defaultSettings = [
    {
      category: "security",
      key: "geofence_settings",
      value: {
        enable_geofencing: false,
        allowed_radius_meters: 100,
        require_selfie: false
      }
    },
    {
      category: "work_schedule",
      key: "work_hours",
      value: {
        shift_start: "09:00",
        shift_end: "18:00",
        grace_period_minutes: 15,
        half_day_hours: 4.5,
        full_day_hours: 8
      }
    },
    {
      category: "leave_policy",
      key: "default_quotas",
      value: {
        casual_leaves_per_year: 25,
        sick_leaves_per_year: 10,
        paid_leaves_per_year: 6,
        allow_half_day: true
      }
    },
    {
      category: "payroll_policy",
      key: "salary_structure",
      value: {
        basic_percentage: 50,
        hra_percentage: 30,
        allowances_percentage: 20,
        pf_employee_percent: 12,
        esi_employee_percent: 0.75
      }
    }
  ];

  let seededCount = 0;
  for (const c of companies.rows) {
    const existing = await query(
      "SELECT key FROM environment_settings WHERE company_id = $1 AND key = 'geofence_settings'",
      [c.id]
    );

    if (existing.rows.length === 0) {
      console.log(`Seeding defaults for company: ${c.name} (${c.id})`);
      for (const s of defaultSettings) {
        const envId = "env_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        await query(
          `INSERT INTO environment_settings (id, company_id, category, key, value)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [envId, c.id, s.category, s.key, JSON.stringify(s.value)]
        );
      }
      seededCount++;
    }
  }

  console.log(`Successfully seeded defaults for ${seededCount} companies.`);
  process.exit(0);
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
