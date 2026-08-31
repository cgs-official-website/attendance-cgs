import { query } from "../config/db.js";

export const getLeaveRequests = async (req, res) => {
  try {
    const { companyId, userId, status } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = `
      SELECT l.*, u.name as user_name, u.email as user_email, u.department
      FROM leave_requests l
      JOIN users u ON l.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND l.company_id = $${params.length}`;
    }

    if (userId) {
      params.push(userId);
      sql += ` AND l.user_id = $${params.length}`;
    } else if (req.user?.role === "employee") {
      params.push(req.user.id);
      sql += ` AND l.user_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND l.status = $${params.length}`;
    }

    sql += " ORDER BY l.applied_at DESC";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getLeaveRequests error:", err);
    res.status(500).json({ error: "Failed to fetch leave requests." });
  }
};

export const createLeaveRequest = async (req, res) => {
  try {
    const { leaveType, startDate, endDate, totalDays, reason } = req.body;
    const userId = req.user.id;
    const companyId = req.user.companyId;

    if (!leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({ error: "Missing required leave request fields." });
    }

    const id = "leave_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const result = await query(
      `INSERT INTO leave_requests (id, user_id, company_id, leave_type, start_date, end_date, total_days, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [id, userId, companyId, leaveType, startDate, endDate, Number(totalDays || 1), reason]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("createLeaveRequest error:", err);
    res.status(500).json({ error: "Failed to create leave request." });
  }
};

export const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const reviewerId = req.user.id;

    if (!["approved", "rejected", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const result = await query(
      `UPDATE leave_requests
       SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status, reviewerId, rejectionReason || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Leave request not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("updateLeaveStatus error:", err);
    res.status(500).json({ error: "Failed to update leave request status." });
  }
};
