import { query } from "../config/db.js";

export const getAttendance = async (req, res) => {
  try {
    const { userId, companyId, startDate, endDate, date } = req.query;
    let sql = "SELECT * FROM attendance WHERE 1=1";
    const params = [];

    if (userId) {
      params.push(userId);
      sql += ` AND user_id = $${params.length}`;
    } else if (req.user && req.user.role === "employee") {
      params.push(req.user.id);
      sql += ` AND user_id = $${params.length}`;
    }

    if (companyId || req.user?.companyId) {
      params.push(companyId || req.user.companyId);
      sql += ` AND company_id = $${params.length}`;
    }

    if (date) {
      params.push(date);
      sql += ` AND date = $${params.length}`;
    }

    if (startDate && endDate) {
      params.push(startDate);
      sql += ` AND date >= $${params.length}`;
      params.push(endDate);
      sql += ` AND date <= $${params.length}`;
    }

    sql += " ORDER BY date DESC, check_in DESC LIMIT 500";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getAttendance error:", err);
    res.status(500).json({ error: "Failed to fetch attendance logs." });
  }
};

export const checkIn = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;
    const today = new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();
    const { location, workMode = "office" } = req.body;

    const recordId = `${userId}_${today}`;
    const result = await query(
      `INSERT INTO attendance (id, user_id, company_id, date, check_in, status, work_mode, check_in_location, location)
       VALUES ($1, $2, $3, $4, $5, 'present', $6, $7, $7)
       ON CONFLICT (id) DO UPDATE SET
         check_in = COALESCE(attendance.check_in, EXCLUDED.check_in),
         check_in_location = EXCLUDED.check_in_location,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [recordId, userId, companyId, today, now, workMode, JSON.stringify(location || {})]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("checkIn error:", err);
    res.status(500).json({ error: "Check-in failed." });
  }
};

export const checkOut = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();
    const { location } = req.body;

    const recordId = `${userId}_${today}`;
    
    // Fetch check_in to calculate duration
    const existing = await query("SELECT check_in FROM attendance WHERE id = $1", [recordId]);
    let durationMinutes = 0;
    if (existing.rows.length > 0 && existing.rows[0].check_in) {
      const checkInTime = new Date(existing.rows[0].check_in);
      durationMinutes = Math.max(0, Math.floor((new Date(now) - checkInTime) / 60000));
    }

    const result = await query(
      `UPDATE attendance
       SET check_out = $1, check_out_location = $2, duration_minutes = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [now, JSON.stringify(location || {}), durationMinutes, recordId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No check-in found for today." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("checkOut error:", err);
    res.status(500).json({ error: "Check-out failed." });
  }
};
