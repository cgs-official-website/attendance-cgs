import { query } from "../config/db.js";

export const getUsers = async (req, res) => {
  try {
    const { companyId } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = `
      SELECT id, name, email, role, department, designation, program_type,
             employment_type, phone, avatar_url, status, shift_start, shift_end,
             casual_leave_quota, sick_leave_quota, paid_leave_quota, gross_salary,
             paid_days, is_project_manager, project, projects, skills, created_at
      FROM users WHERE 1=1
    `;
    const params = [];

    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND company_id = $${params.length}`;
    }

    sql += " ORDER BY name ASC";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getUsers error:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const fields = [];
    const values = [];
    let idx = 1;

    const allowedFields = [
      "name", "department", "designation", "role", "program_type", "employment_type",
      "phone", "avatar_url", "status", "shift_start", "shift_end", "casual_leave_quota",
      "sick_leave_quota", "paid_leave_quota", "gross_salary", "paid_days", "project",
      "projects", "skills", "company_id"
    ];

    for (const key of Object.keys(updates)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(snakeKey)) {
        fields.push(`${snakeKey} = $${idx}`);
        values.push(updates[key]);
        idx++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update." });
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const sql = `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const { password_hash, ...updatedUser } = result.rows[0];
    res.json(updatedUser);
  } catch (err) {
    console.error("updateUser error:", err);
    res.status(500).json({ error: "Failed to update user." });
  }
};
