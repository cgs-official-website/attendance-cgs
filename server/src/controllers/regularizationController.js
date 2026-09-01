import { query } from "../config/db.js";

export const getRegularizationRequests = async (req, res) => {
  try {
    const { companyId, userId, status } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = `
      SELECT r.*, u.name as user_name, u.email as user_email, u.department
      FROM regularization_requests r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND r.company_id = $${params.length}`;
    }

    if (userId) {
      params.push(userId);
      sql += ` AND r.user_id = $${params.length}`;
    } else if (req.user?.role === "employee") {
      params.push(req.user.id);
      sql += ` AND r.user_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND r.status = $${params.length}`;
    }

    sql += " ORDER BY r.applied_at DESC NULLS LAST LIMIT 500";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getRegularizationRequests error:", err);
    res.status(500).json({ error: "Failed to fetch regularization requests." });
  }
};

export const createRegularizationRequest = async (req, res) => {
  try {
    const { date, checkIn, checkOut, reason } = req.body;
    const userId = req.user?.id || req.body.userId;
    const companyId = req.user?.companyId || req.body.companyId;

    if (!date || !reason) {
      return res.status(400).json({ error: "Date and reason are required." });
    }

    const id = "reg_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const result = await query(
      `INSERT INTO regularization_requests (id, user_id, company_id, date, check_in, check_out, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [id, userId, companyId, date, checkIn || null, checkOut || null, reason]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("createRegularizationRequest error:", err);
    res.status(500).json({ error: "Failed to create regularization request." });
  }
};

export const updateRegularizationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, managerComment, rejectionReason } = req.body;
    const reviewerId = req.user?.id || null;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const result = await query(
      `UPDATE regularization_requests
       SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
           manager_comment = $3, rejection_reason = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [status, reviewerId, managerComment || null, rejectionReason || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Regularization request not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("updateRegularizationStatus error:", err);
    res.status(500).json({ error: "Failed to update regularization request." });
  }
};
