import { query } from "../config/db.js";

export const getAttendance = async (req, res) => {
  try {
    const { userId, companyId, startDate, endDate, date } = req.query;
    let sql = `
      SELECT a.*, a.id as "_id", u.name as user_name, u.name as "userName",
             u.email as user_email, u.department as "userDept", u.department
      FROM attendance a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      params.push(userId);
      sql += ` AND a.user_id = $${params.length}`;
    } else if (req.user && req.user.role === "employee") {
      params.push(req.user.id);
      sql += ` AND a.user_id = $${params.length}`;
    }

    if (companyId || req.user?.companyId) {
      params.push(companyId || req.user.companyId);
      sql += ` AND a.company_id = $${params.length}`;
    }

    if (date) {
      params.push(date);
      sql += ` AND a.date = $${params.length}`;
    }

    if (startDate && endDate) {
      params.push(startDate);
      sql += ` AND a.date >= $${params.length}`;
      params.push(endDate);
      sql += ` AND a.date <= $${params.length}`;
    }

    sql += " ORDER BY a.date DESC, a.check_in DESC LIMIT 1000";
    const result = await query(sql, params);
    
    // Format check_in/check_out/status for client
    const logs = result.rows.map(row => {
      const checkInDate = row.check_in ? new Date(row.check_in) : null;
      const checkOutDate = row.check_out ? new Date(row.check_out) : null;
      const formatTime = (d) => d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : "";
      
      const durationHours = row.duration_minutes ? (row.duration_minutes / 60).toFixed(1) : (row.check_out ? "0.0" : "Live");

      return {
        ...row,
        id: row.id,
        userId: row.user_id,
        companyId: row.company_id,
        checkIn: formatTime(checkInDate),
        checkOut: formatTime(checkOutDate),
        checkInLocation: row.check_in_location || row.location,
        checkOutLocation: row.check_out_location,
        totalHours: durationHours,
        status: row.check_out ? "completed" : (row.check_in ? "in-progress" : row.status)
      };
    });

    res.json(logs);
  } catch (err) {
    console.error("getAttendance error:", err);
    res.status(500).json({ error: "Failed to fetch attendance logs." });
  }
};

export const checkIn = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const companyId = req.user?.companyId || req.body.companyId;
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
    const userId = req.user?.id || req.body.userId;
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

export const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { checkIn, checkOut, status, date } = req.body;

    const result = await query(
      `UPDATE attendance
       SET check_in = COALESCE($1, check_in),
           check_out = COALESCE($2, check_out),
           status = COALESCE($3, status),
           date = COALESCE($4, date),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [checkIn || null, checkOut || null, status || null, date || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Attendance record not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("updateAttendance error:", err);
    res.status(500).json({ error: "Failed to update attendance." });
  }
};

export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("DELETE FROM attendance WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Attendance record not found." });
    }
    res.json({ message: "Attendance record deleted.", id });
  } catch (err) {
    console.error("deleteAttendance error:", err);
    res.status(500).json({ error: "Failed to delete attendance record." });
  }
};

// Rules
export const getAttendanceRules = async (req, res) => {
  try {
    const result = await query("SELECT value FROM settings WHERE key = 'attendance_rules' OR id = 'attendance_rules'");
    if (result.rows.length > 0) {
      res.json({ rules: result.rows[0].value?.rules || result.rows[0].value || "" });
    } else {
      res.json({ rules: "" });
    }
  } catch (err) {
    console.error("getAttendanceRules error:", err);
    res.status(500).json({ error: "Failed to fetch attendance rules." });
  }
};

export const updateAttendanceRules = async (req, res) => {
  try {
    const { rules } = req.body;
    await query(
      `INSERT INTO settings (id, key, value)
       VALUES ('attendance_rules', 'attendance_rules', $1)
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify({ rules })]
    );
    res.json({ success: true, rules });
  } catch (err) {
    console.error("updateAttendanceRules error:", err);
    res.status(500).json({ error: "Failed to update attendance rules." });
  }
};
