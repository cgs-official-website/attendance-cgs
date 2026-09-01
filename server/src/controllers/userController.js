import { query } from "../config/db.js";

export const getUsers = async (req, res) => {
  try {
    const { companyId } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = `
      SELECT id, id as uid, name, email, role, department, designation, program_type,
             employment_type, phone, avatar_url, avatar_url as avatar, status,
             shift_start, shift_end, casual_leave_quota, sick_leave_quota, paid_leave_quota,
             gross_salary, paid_days, is_project_manager, project, projects, skills,
             company_id, company_id as "companyId", metadata, created_at
      FROM users WHERE 1=1
    `;
    const params = [];

    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND company_id = $${params.length}`;
    }

    sql += " ORDER BY name ASC";
    const result = await query(sql, params);
    
    // Map response so frontend expecting camelCase (uid, companyId, etc.) gets full compatibility
    const users = result.rows.map(row => {
      const { metadata = {}, ...rest } = row;
      return {
        ...rest,
        uid: row.id,
        companyId: row.company_id,
        shiftStart: row.shift_start,
        shiftEnd: row.shift_end,
        annualLeaves: Number(row.casual_leave_quota || 25),
        sickLeaves: Number(row.sick_leave_quota || 10),
        casualLeaves: Number(row.paid_leave_quota || 6),
        isProjectManager: row.is_project_manager,
        ...metadata
      };
    });

    res.json(users);
  } catch (err) {
    console.error("getUsers error:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    const allowedFields = [
      "name", "department", "designation", "role", "program_type", "employment_type",
      "phone", "avatar_url", "status", "shift_start", "shift_end", "casual_leave_quota",
      "sick_leave_quota", "paid_leave_quota", "gross_salary", "paid_days", "project",
      "projects", "skills", "company_id", "metadata", "is_project_manager"
    ];

    for (const key of Object.keys(updates)) {
      let snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (key === "annualLeaves") snakeKey = "casual_leave_quota";
      if (key === "sickLeaves") snakeKey = "sick_leave_quota";
      if (key === "casualLeaves") snakeKey = "paid_leave_quota";
      if (key === "avatar") snakeKey = "avatar_url";

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
    res.json({
      ...updatedUser,
      uid: updatedUser.id,
      companyId: updatedUser.company_id
    });
  } catch (err) {
    console.error("updateUser error:", err);
    res.status(500).json({ error: "Failed to update user." });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({ message: "User deleted successfully.", id });
  } catch (err) {
    console.error("deleteUser error:", err);
    res.status(500).json({ error: "Failed to delete user." });
  }
};
