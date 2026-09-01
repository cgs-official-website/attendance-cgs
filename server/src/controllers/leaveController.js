import { query } from "../config/db.js";
import { sendLeaveRequestNotification, sendLeaveStatusEmail } from "../services/emailService.js";

export const getLeaveRequests = async (req, res) => {
  try {
    const { companyId, userId, status } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = `
      SELECT l.*, l.id as "_id", u.name as user_name, u.name as "userName", u.email as user_email, u.department as "userDept", u.department
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

    sql += " ORDER BY l.applied_at DESC NULLS LAST LIMIT 500";
    const result = await query(sql, params);
    
    // Camelcase mapping for frontend
    const leaves = result.rows.map(row => ({
      ...row,
      userId: row.user_id,
      companyId: row.company_id,
      leaveType: row.leave_type,
      startDate: row.start_date,
      endDate: row.end_date,
      totalDays: row.total_days,
      appliedAt: row.applied_at,
      rejectionReason: row.rejection_reason,
      reviewedBy: row.reviewed_by
    }));

    res.json(leaves);
  } catch (err) {
    console.error("getLeaveRequests error:", err);
    res.status(500).json({ error: "Failed to fetch leave requests." });
  }
};

export const createLeaveRequest = async (req, res) => {
  try {
    const { leaveType, startDate, endDate, totalDays, reason } = req.body;
    const userId = req.user?.id || req.body.userId;
    const companyId = req.user?.companyId || req.body.companyId;

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

    const leave = result.rows[0];

    // Asynchronously notify company admin / manager
    (async () => {
      try {
        const userRes = await query("SELECT name FROM users WHERE id = $1", [userId]);
        const employeeName = userRes.rows[0]?.name || "An employee";
        const adminRes = await query(
          "SELECT email FROM users WHERE company_id = $1 AND role IN ('admin', 'superadmin', 'manager') LIMIT 5",
          [companyId]
        );
        for (const admin of adminRes.rows) {
          sendLeaveRequestNotification({
            adminEmail: admin.email,
            employeeName,
            leaveType,
            startDate,
            endDate,
            totalDays: Number(totalDays || 1),
            reason
          }).catch(() => {});
        }
      } catch (e) {
        console.error("Error dispatching leave request email:", e);
      }
    })();

    res.status(201).json({
      ...leave,
      userId: leave.user_id,
      companyId: leave.company_id,
      leaveType: leave.leave_type,
      startDate: leave.start_date,
      endDate: leave.end_date,
      totalDays: leave.total_days
    });
  } catch (err) {
    console.error("createLeaveRequest error:", err);
    res.status(500).json({ error: "Failed to create leave request." });
  }
};

export const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, managerComment } = req.body;
    const reviewerId = req.user?.id || null;

    if (!["approved", "rejected", "cancelled", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const result = await query(
      `UPDATE leave_requests
       SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status, reviewerId, rejectionReason || managerComment || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Leave request not found." });
    }

    const updatedLeave = result.rows[0];

    // Asynchronously notify the employee about leave decision
    (async () => {
      try {
        const userRes = await query("SELECT email, name FROM users WHERE id = $1", [updatedLeave.user_id]);
        if (userRes.rows.length > 0) {
          const user = userRes.rows[0];
          sendLeaveStatusEmail({
            email: user.email,
            name: user.name,
            leaveType: updatedLeave.leave_type,
            startDate: updatedLeave.start_date,
            endDate: updatedLeave.end_date,
            totalDays: updatedLeave.total_days,
            status: updatedLeave.status,
            rejectionReason: updatedLeave.rejection_reason
          }).catch(() => {});
        }
      } catch (e) {
        console.error("Error dispatching leave status email:", e);
      }
    })();

    res.json({
      ...updatedLeave,
      userId: updatedLeave.user_id,
      companyId: updatedLeave.company_id,
      leaveType: updatedLeave.leave_type,
      startDate: updatedLeave.start_date,
      endDate: updatedLeave.end_date,
      totalDays: updatedLeave.total_days
    });
  } catch (err) {
    console.error("updateLeaveStatus error:", err);
    res.status(500).json({ error: "Failed to update leave request status." });
  }
};

export const deleteLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("DELETE FROM leave_requests WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Leave request not found." });
    }
    res.json({ message: "Leave request deleted.", id });
  } catch (err) {
    console.error("deleteLeaveRequest error:", err);
    res.status(500).json({ error: "Failed to delete leave request." });
  }
};

// Paid Leaves
export const getPaidLeaves = async (req, res) => {
  try {
    const { companyId } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = "SELECT * FROM paid_leaves WHERE 1=1";
    const params = [];
    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND company_id = $${params.length}`;
    }
    sql += " ORDER BY start_date DESC";
    const result = await query(sql, params);
    res.json(result.rows.map(r => ({
      ...r,
      companyId: r.company_id,
      startDate: r.start_date,
      endDate: r.end_date
    })));
  } catch (err) {
    console.error("getPaidLeaves error:", err);
    res.status(500).json({ error: "Failed to fetch paid leaves." });
  }
};

export const createPaidLeave = async (req, res) => {
  try {
    const { title, startDate, endDate, description = "", status = "active", companyId } = req.body;
    const targetCompanyId = companyId || req.user?.companyId;

    if (!title || !startDate || !endDate) {
      return res.status(400).json({ error: "Title, startDate, and endDate are required." });
    }

    const id = "paid_leave_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const result = await query(
      `INSERT INTO paid_leaves (id, company_id, title, start_date, end_date, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, targetCompanyId, title, startDate, endDate, description, status]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("createPaidLeave error:", err);
    res.status(500).json({ error: "Failed to create paid leave." });
  }
};

export const deletePaidLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("DELETE FROM paid_leaves WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Paid leave not found." });
    }
    res.json({ message: "Paid leave deleted.", id });
  } catch (err) {
    console.error("deletePaidLeave error:", err);
    res.status(500).json({ error: "Failed to delete paid leave." });
  }
};
