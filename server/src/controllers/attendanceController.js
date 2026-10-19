import { query } from "../config/db.js";
import auditService from "../services/auditService.js";
import securityDetector from "../services/securityDetector.js";

export const getAttendance = async (req, res) => {
  try {
    const { userId, companyId, startDate, endDate, date } = req.query;
    const isSuperAdmin = req.user?.role?.toLowerCase() === "superadmin";
    const targetCompanyId = (isSuperAdmin && companyId) ? companyId : req.user?.companyId;

    let sql = `
      SELECT a.*, a.date::text as date_str, a.id as "_id", u.name as user_name, u.name as "userName",
             u.email as user_email, u.department as "userDept", u.department
      FROM attendance a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user && req.user.role === "employee") {
      params.push(req.user.id);
      sql += ` AND a.user_id = $${params.length}`;
    } else if (userId) {
      params.push(userId);
      sql += ` AND a.user_id = $${params.length}`;
    }

    if (targetCompanyId) {
      params.push(targetCompanyId);
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
      const dateStr = row.date_str || (row.date instanceof Date ? row.date.toISOString().split("T")[0] : (row.date ? String(row.date).split("T")[0] : ""));

      let frontendStatus = "not-checked-in";
      let currentBreakTimerEnd = null;
      if (row.check_out) {
        frontendStatus = "checked-out";
      } else if (Array.isArray(row.breaks) && row.breaks.some(b => !b.end && !b.resumeTime)) {
        frontendStatus = "on-break";
        const activeB = row.breaks.find(b => !b.end && !b.resumeTime);
        if (activeB) {
          const bStart = new Date(activeB.start || activeB.startTime).getTime();
          const bType = activeB.breakType || activeB.type || "short";
          const durSec = bType === "bio" ? 900 : 1800;
          currentBreakTimerEnd = new Date(bStart + durSec * 1000).toISOString();
        }
      } else if (row.check_in) {
        frontendStatus = "checked-in";
      }

      return {
        ...row,
        id: row.id,
        userId: row.user_id,
        companyId: row.company_id,
        date: dateStr,
        checkIn: formatTime(checkInDate),
        checkOut: formatTime(checkOutDate),
        checkInTime: row.check_in,
        checkOutTime: row.check_out,
        checkInLocation: row.check_in_location || row.location,
        checkOutLocation: row.check_out_location,
        totalHours: durationHours,
        status: frontendStatus,
        currentBreakTimerEnd
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
    let userId = req.user?.id || req.body.userId;
    if (typeof userId === "object" && userId !== null) {
      userId = userId.uid || userId.id;
    }
    const companyId = req.user?.companyId || req.body.companyId || req.body.userId?.companyId;
    const today = req.body.date || new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();
    const { location, workMode = "office" } = req.body;

    const recordId = `${userId}_${today}`;
    const result = await query(
      `INSERT INTO attendance (id, user_id, company_id, date, check_in, status, work_mode, check_in_location, location)
       VALUES ($1, $2, $3, $4, $5, 'present', $6, $7, $7)
       ON CONFLICT (id) DO UPDATE SET
         check_in = COALESCE(attendance.check_in, EXCLUDED.check_in),
         check_out = NULL,
         status = 'present',
         check_in_location = EXCLUDED.check_in_location,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [recordId, userId, companyId, today, now, workMode, JSON.stringify(location || {})]
    );

    const row = result.rows[0];
    const checkInDate = row.check_in ? new Date(row.check_in) : new Date();
    const formatTime = (d) => d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : "";

    auditService.logAudit({
      userId,
      action: "ATTENDANCE_CLOCK_IN",
      resourceType: "attendance",
      resourceId: row.id,
      details: { date: today, workMode, location },
      req
    });

    res.json({
      ...row,
      id: row.id,
      userId: row.user_id,
      companyId: row.company_id,
      date: today,
      checkIn: formatTime(checkInDate),
      checkInTime: row.check_in || now,
      checkInLocation: row.check_in_location || row.location,
      status: "checked-in"
    });
  } catch (err) {
    console.error("checkIn error:", err);
    res.status(500).json({ error: "Check-in failed." });
  }
};

export const checkOut = async (req, res) => {
  try {
    let userId = req.user?.id || req.body.userId;
    if (typeof userId === "object" && userId !== null) {
      userId = userId.uid || userId.id;
    }
    const today = req.body.date || new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();
    const { location } = req.body;

    const recordId = `${userId}_${today}`;
    
    // Fetch check_in to calculate duration and handle any open breaks
    const existing = await query("SELECT * FROM attendance WHERE id = $1", [recordId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "No check-in found for today." });
    }

    const rowData = existing.rows[0];
    let durationMinutes = 0;
    const breaks = Array.isArray(rowData.breaks) ? [...rowData.breaks] : [];
    let totalBreakMinutes = 0;

    breaks.forEach(b => {
      if (b.start && b.end) {
        totalBreakMinutes += Math.max(0, Math.floor((new Date(b.end) - new Date(b.start)) / 60000));
      } else if (b.start && !b.end) {
        b.end = now;
        const dur = Math.max(0, Math.floor((new Date(now) - new Date(b.start)) / 60000));
        b.durationMinutes = dur;
        totalBreakMinutes += dur;
      }
    });

    if (rowData.check_in) {
      const checkInTime = new Date(rowData.check_in);
      const rawElapsed = Math.max(0, Math.floor((new Date(now) - checkInTime) / 60000));
      durationMinutes = Math.max(0, rawElapsed - totalBreakMinutes);
    }

    const checkoutStatus = durationMinutes < 240 ? "half-day" : "present";

    const result = await query(
      `UPDATE attendance
       SET check_out = $1, check_out_location = $2, duration_minutes = $3, breaks = $4, status = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [now, JSON.stringify(location || {}), durationMinutes, JSON.stringify(breaks), checkoutStatus, recordId]
    );

    const row = result.rows[0];
    const checkOutDate = row.check_out ? new Date(row.check_out) : new Date();
    const formatTime = (d) => d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : "";

    auditService.logAudit({
      userId: row.user_id,
      action: "ATTENDANCE_CLOCK_OUT",
      resourceType: "attendance",
      resourceId: row.id,
      details: { date: today, totalWorkingMinutes: durationMinutes },
      req
    });

    res.json({
      ...row,
      id: row.id,
      userId: row.user_id,
      companyId: row.company_id,
      date: today,
      checkOut: formatTime(checkOutDate),
      checkOutTime: row.check_out || now,
      totalWorkingMinutes: durationMinutes,
      status: "checked-out"
    });
  } catch (err) {
    console.error("checkOut error:", err);
    res.status(500).json({ error: "Check-out failed." });
  }
};

export const startBreak = async (req, res) => {
  try {
    let userId = req.user?.id || req.body.userId;
    if (typeof userId === "object" && userId !== null) {
      userId = userId.uid || userId.id;
    }
    const today = req.body.date || new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();
    const { breakType = "short", reason = "break", location } = req.body;

    const recordId = `${userId}_${today}`;
    const existing = await query("SELECT * FROM attendance WHERE id = $1", [recordId]);
    if (existing.rows.length === 0 || !existing.rows[0].check_in) {
      return res.status(400).json({ error: "Cannot start a break without checking in first." });
    }
    if (existing.rows[0].check_out) {
      return res.status(400).json({ error: "Cannot start a break after checking out." });
    }

    const row = existing.rows[0];
    const breaks = Array.isArray(row.breaks) ? [...row.breaks] : [];
    if (breaks.some(b => !b.end && !b.resumeTime)) {
      return res.status(400).json({ error: "A break is already in progress." });
    }

    // Daily 3-break limit check
    if (breaks.length >= 3) {
      return res.status(400).json({ error: "Maximum limit reached. An employee can only take up to 3 breaks per day." });
    }

    // Check if this specific break has already been taken and resumed
    const normalizedReqType = String(breakType).toLowerCase();
    const isTypeAlreadyUsed = breaks.some(b => {
      const bType = String(b.breakType || b.type || "").toLowerCase();
      const isResumed = Boolean(b.end || b.resumeTime);
      if (!isResumed) return false;

      if (normalizedReqType === "short" || normalizedReqType === "break1") {
        return bType === "short" || bType === "break1";
      }
      if (normalizedReqType === "long" || normalizedReqType === "break2") {
        return bType === "long" || bType === "break2";
      }
      if (normalizedReqType === "bio" || normalizedReqType === "break3") {
        return bType === "bio" || bType === "break3";
      }
      return bType === normalizedReqType;
    });

    if (isTypeAlreadyUsed) {
      return res.status(400).json({ error: "This break has already been taken and resumed today. It has been removed from your available breaks." });
    }

    let durationSeconds = 1800; // default 30 mins
    if (normalizedReqType === "bio" || normalizedReqType === "break3") durationSeconds = 900; // 15 mins
    const timerEnd = new Date(Date.now() + durationSeconds * 1000).toISOString();

    breaks.push({
      start: now,
      startTime: now,
      end: null,
      resumeTime: null,
      breakType,
      type: breakType,
      reason,
      location: location || null
    });

    const result = await query(
      `UPDATE attendance
       SET breaks = $1, status = 'on-break', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(breaks), recordId]
    );

    const updated = result.rows[0];

    // Non-blocking Audit Log: Break Started
    auditService.logAudit({
      userId,
      action: "ATTENDANCE_BREAK_START",
      resourceType: "attendance",
      resourceId: recordId,
      details: {
        breakNumber: breaks.length,
        breakType,
        startTime: now,
        durationMinutes: durationSeconds / 60,
        remainingBreaksAfterThis: Math.max(0, 3 - breaks.length),
        location: location || null
      },
      req
    });

    res.json({
      ...updated,
      id: updated.id,
      userId: updated.user_id,
      companyId: updated.company_id,
      date: today,
      checkInTime: updated.check_in,
      checkOutTime: updated.check_out,
      currentBreakTimerEnd: timerEnd,
      status: "on-break",
      breaks: updated.breaks
    });
  } catch (err) {
    console.error("startBreak error:", err);
    res.status(500).json({ error: "Failed to start break." });
  }
};

export const endBreak = async (req, res) => {
  try {
    let userId = req.user?.id || req.body.userId;
    if (typeof userId === "object" && userId !== null) {
      userId = userId.uid || userId.id;
    }
    const today = req.body.date || new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();
    const { location } = req.body;

    const recordId = `${userId}_${today}`;
    const existing = await query("SELECT * FROM attendance WHERE id = $1", [recordId]);
    if (existing.rows.length === 0 || !existing.rows[0].check_in) {
      return res.status(400).json({ error: "No attendance record found for today." });
    }

    const row = existing.rows[0];
    const breaks = Array.isArray(row.breaks) ? [...row.breaks] : [];
    const activeIdx = breaks.findIndex(b => !b.end && !b.resumeTime);
    if (activeIdx === -1) {
      return res.status(400).json({ error: "No active break to resume from." });
    }

    const breakStart = new Date(breaks[activeIdx].start || breaks[activeIdx].startTime);
    const breakDurationMinutes = Math.max(0, Math.floor((new Date(now) - breakStart) / 60000));
    breaks[activeIdx].end = now;
    breaks[activeIdx].resumeTime = now;
    breaks[activeIdx].durationMinutes = breakDurationMinutes;
    breaks[activeIdx].duration = breakDurationMinutes;
    if (location) breaks[activeIdx].endLocation = location;

    const result = await query(
      `UPDATE attendance
       SET breaks = $1, status = 'present', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(breaks), recordId]
    );

    const updated = result.rows[0];

    // Non-blocking Audit Log: Break Resumed
    const completedBreak = breaks[activeIdx];
    const totalCompletedBreaks = breaks.filter(b => b.end || b.resumeTime).length;
    auditService.logAudit({
      userId: row.user_id,
      action: "ATTENDANCE_BREAK_RESUME",
      resourceType: "attendance",
      resourceId: recordId,
      details: {
        breakNumber: activeIdx + 1,
        breakType: completedBreak.breakType || completedBreak.type,
        startTime: completedBreak.start || completedBreak.startTime,
        resumeTime: now,
        durationMinutes: breakDurationMinutes,
        totalCompletedBreaks,
        remainingBreaks: Math.max(0, 3 - totalCompletedBreaks),
        location: location || null
      },
      req
    });

    res.json({
      ...updated,
      id: updated.id,
      userId: updated.user_id,
      companyId: updated.company_id,
      date: today,
      checkInTime: updated.check_in,
      checkOutTime: updated.check_out,
      status: "checked-in",
      breaks: updated.breaks
    });
  } catch (err) {
    console.error("endBreak error:", err);
    res.status(500).json({ error: "Failed to end break." });
  }
};

export const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const callerRole = req.user?.role?.toLowerCase();
    const isAllowed = callerRole === "admin" || callerRole === "superadmin" || callerRole === "manager" || callerRole === "system admin";

    if (!isAllowed) {
      return res.status(403).json({ error: "Access forbidden. Admin or Manager role required to edit attendance records." });
    }

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

    const updatedRow = result.rows[0];
    auditService.logAudit({
      userId: req.user?.id,
      action: "ATTENDANCE_EDIT",
      resourceType: "attendance",
      resourceId: id,
      details: { checkIn, checkOut, status, date, targetUserId: updatedRow.user_id },
      req
    });
    securityDetector.checkSuspiciousAction({
      userId: req.user?.id,
      action: "ATTENDANCE_EDIT",
      resourceType: "attendance",
      details: { checkIn, checkOut, status, date, targetUserId: updatedRow.user_id },
      req
    });

    res.json(updatedRow);
  } catch (err) {
    console.error("updateAttendance error:", err);
    res.status(500).json({ error: "Failed to update attendance." });
  }
};

export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const callerRole = req.user?.role?.toLowerCase();
    const isAllowed = callerRole === "admin" || callerRole === "superadmin" || callerRole === "system admin";

    if (!isAllowed) {
      return res.status(403).json({ error: "Access forbidden. Admin role required to delete attendance records." });
    }

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
    const { companyId } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    if (targetCompanyId) {
      const compResult = await query("SELECT value FROM settings WHERE key = $1", [`attendance_rules_${targetCompanyId}`]);
      if (compResult.rows.length > 0) {
        const val = compResult.rows[0].value;
        return res.json({ rules: typeof val === "object" && val !== null ? (val.rules || "") : (val || "") });
      }
    }

    const result = await query("SELECT value FROM settings WHERE key = 'attendance_rules'");
    if (result.rows.length > 0) {
      const val = result.rows[0].value;
      res.json({ rules: typeof val === "object" && val !== null ? (val.rules || "") : (val || "") });
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
    const { rules, companyId } = req.body;
    const targetCompanyId = companyId || req.user?.companyId;

    if (targetCompanyId) {
      await query(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [`attendance_rules_${targetCompanyId}`, JSON.stringify({ rules })]
      );
    }

    await query(
      `INSERT INTO settings (key, value)
       VALUES ('attendance_rules', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify({ rules })]
    );

    res.json({ success: true, rules });
  } catch (err) {
    console.error("updateAttendanceRules error:", err);
    res.status(500).json({ error: "Failed to update attendance rules." });
  }
};
