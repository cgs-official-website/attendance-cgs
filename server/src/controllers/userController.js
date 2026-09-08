import bcrypt from "bcryptjs";
import pool, { query } from "../config/db.js";

export const getUsers = async (req, res) => {
  try {
    const { companyId } = req.query;
    const role = req.user?.role?.toLowerCase();
    const isSuperAdmin = role === "superadmin";

    // Multi-tenant boundary: Only superadmins can query an arbitrary companyId.
    const targetCompanyId = (isSuperAdmin && companyId) ? companyId : (req.user?.companyId || companyId);

    let sql = `
      SELECT id, id as uid, name, email, role, department, designation, program_type,
             employment_type, phone, avatar_url, avatar_url as avatar, status,
             shift_start, shift_end, casual_leave_quota, sick_leave_quota, paid_leave_quota,
             gross_salary, paid_days, is_project_manager, project, projects, skills,
             company_id, company_id as "companyId", employee_id, metadata, created_at
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
      const meta = metadata && typeof metadata === "object" ? metadata : {};
      const empId = row.employee_id || meta.employeeId || meta.employee_id || "";
      return {
        ...rest,
        ...meta,
        uid: row.id,
        id: row.id,
        employeeId: empId,
        employee_id: empId,
        companyId: row.company_id,
        company_id: row.company_id,
        shiftStart: row.shift_start,
        shiftEnd: row.shift_end,
        annualLeaves: Number(row.casual_leave_quota || 25),
        sickLeaves: Number(row.sick_leave_quota || 10),
        casualLeaves: Number(row.paid_leave_quota || 6),
        isProjectManager: row.is_project_manager,
        projects: Array.isArray(row.projects) ? row.projects : (meta.projects || []),
        tasks: Array.isArray(meta.tasks) ? meta.tasks : [],
        grossSalary: Number(row.gross_salary || 0),
        paidDays: Number(row.paid_days || 0)
      };
    });

    res.json(users);
  } catch (err) {
    console.error("getUsers error:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role?.toLowerCase();
    const isSuperAdmin = role === "superadmin";

    let sql = "SELECT * FROM users WHERE id = $1";
    const params = [id];

    // Non-superadmins can only access users within their own company
    if (!isSuperAdmin && req.user?.companyId) {
      sql += " AND company_id = $2";
      params.push(req.user.companyId);
    }

    const result = await query(sql, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    const { password_hash, metadata = {}, ...u } = result.rows[0];
    const meta = metadata && typeof metadata === "object" ? metadata : {};
    const empId = u.employee_id || meta.employeeId || meta.employee_id || "";
    res.json({
      ...u,
      ...meta,
      uid: u.id,
      id: u.id,
      employeeId: empId,
      employee_id: empId,
      companyId: u.company_id,
      company_id: u.company_id,
      projects: Array.isArray(u.projects) && u.projects.length > 0 ? u.projects : (meta.projects || []),
      tasks: Array.isArray(meta.tasks) ? meta.tasks : []
    });
  } catch (err) {
    console.error("getUserById error:", err);
    res.status(500).json({ error: "Failed to fetch user." });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const callerRole = req.user?.role?.toLowerCase();
    const isSuperAdmin = callerRole === "superadmin";
    const isAdmin = callerRole === "admin" || isSuperAdmin || callerRole === "system admin";

    // 1. Fetch target user to check tenant boundaries
    const targetCheck = await query("SELECT id, company_id, role FROM users WHERE id = $1", [id]);
    if (targetCheck.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    const targetUser = targetCheck.rows[0];

    // Non-superadmin cannot touch users of another company
    if (!isSuperAdmin && req.user?.companyId && targetUser.company_id && targetUser.company_id !== req.user.companyId) {
      return res.status(403).json({ error: "Access denied. Cannot modify user from another organization." });
    }

    // Non-admins can only update their own profile
    if (!isAdmin && req.user?.id !== id) {
      return res.status(403).json({ error: "Access denied. You can only update your own profile." });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    // Sensitive fields that ONLY admins/superadmins can alter
    const adminOnlyFields = [
      "role", "company_id", "gross_salary", "paid_days", "casual_leave_quota",
      "sick_leave_quota", "paid_leave_quota", "status", "is_project_manager", "employee_id"
    ];

    const allowedFields = [
      "name", "department", "designation", "role", "program_type", "employment_type",
      "phone", "avatar_url", "status", "shift_start", "shift_end", "casual_leave_quota",
      "sick_leave_quota", "paid_leave_quota", "gross_salary", "paid_days", "project",
      "projects", "skills", "company_id", "metadata", "is_project_manager", "employee_id"
    ];

    for (const key of Object.keys(updates)) {
      let snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (key === "annualLeaves") snakeKey = "casual_leave_quota";
      if (key === "sickLeaves") snakeKey = "sick_leave_quota";
      if (key === "casualLeaves") snakeKey = "paid_leave_quota";
      if (key === "avatar") snakeKey = "avatar_url";
      if (key === "employeeId") snakeKey = "employee_id";

      // Disallow non-admins from updating administrative fields
      if (adminOnlyFields.includes(snakeKey) && !isAdmin) {
        continue;
      }

      // Non-superadmin cannot assign superadmin role
      if (snakeKey === "role" && updates[key] === "superadmin" && !isSuperAdmin) {
        continue;
      }

      if (allowedFields.includes(snakeKey)) {
        fields.push(`${snakeKey} = $${idx}`);
        values.push(updates[key]);
        idx++;
      }
    }

    if (updates.tasks !== undefined) {
      fields.push(`metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('tasks', $${idx}::jsonb)`);
      values.push(JSON.stringify(updates.tasks));
      idx++;
    }

    // Password update: either user self-updating, or admin
    if (updates.password) {
      if (isAdmin || req.user?.id === id) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(updates.password, salt);
        fields.push(`password_hash = $${idx}`);
        values.push(passwordHash);
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

    const { password_hash, metadata = {}, ...updatedUser } = result.rows[0];
    const meta = metadata && typeof metadata === "object" ? metadata : {};
    res.json({
      ...updatedUser,
      ...meta,
      uid: updatedUser.id,
      id: updatedUser.id,
      companyId: updatedUser.company_id,
      company_id: updatedUser.company_id,
      projects: Array.isArray(updatedUser.projects) ? updatedUser.projects : (meta.projects || []),
      tasks: Array.isArray(meta.tasks) ? meta.tasks : [],
      grossSalary: Number(updatedUser.gross_salary || 0),
      paidDays: Number(updatedUser.paid_days || 0)
    });
  } catch (err) {
    console.error("updateUser error:", err);
    res.status(500).json({ error: "Failed to update user." });
  }
};

export const deleteUser = async (req, res) => {
  const callerRole = req.user?.role?.toLowerCase();
  const isSuperAdmin = callerRole === "superadmin";
  const isAdmin = callerRole === "admin" || isSuperAdmin || callerRole === "system admin";

  if (!isAdmin) {
    return res.status(403).json({ error: "Access forbidden. Admin role required to delete users." });
  }

  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Check target user
    const checkRes = await client.query("SELECT id, name, email, role, company_id FROM users WHERE id = $1", [id]);
    if (checkRes.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: "User not found." });
    }
    const target = checkRes.rows[0];

    // Cannot delete superadmin unless caller is superadmin
    if (target.role === "superadmin" && !isSuperAdmin) {
      client.release();
      return res.status(403).json({ error: "Access denied. Cannot delete Superadmin." });
    }

    // Tenant check: Admin can only delete users in their own company
    if (!isSuperAdmin && req.user?.companyId && target.company_id && target.company_id !== req.user.companyId) {
      client.release();
      return res.status(403).json({ error: "Access denied. Cannot delete user from another organization." });
    }

    await client.query("BEGIN");

    // 1. Nullify references that would otherwise block user deletion
    await client.query("UPDATE leave_requests SET reviewed_by = NULL WHERE reviewed_by = $1", [id]);
    await client.query("UPDATE regularization_requests SET reviewed_by = NULL WHERE reviewed_by = $1", [id]);
    await client.query("UPDATE projects SET manager_id = NULL WHERE manager_id = $1", [id]);
    await client.query("UPDATE tasks SET assigned_to = NULL WHERE assigned_to = $1", [id]);
    await client.query("UPDATE tasks SET created_by = NULL WHERE created_by = $1", [id]);
    await client.query("UPDATE channels SET created_by = NULL WHERE created_by = $1", [id]);
    await client.query("UPDATE assets SET assigned_to = NULL WHERE assigned_to = $1", [id]);

    // 2. Remove related junction and report records
    await client.query("DELETE FROM task_reports WHERE user_id = $1", [id]);
    await client.query("DELETE FROM project_members WHERE user_id = $1", [id]);

    // 3. Delete the user (cascades attendance, leave_requests, regularization, messages, payroll, etc.)
    const result = await client.query("DELETE FROM users WHERE id = $1 RETURNING id, name, email", [id]);

    await client.query("COMMIT");

    res.json({ message: "User deleted successfully from database.", user: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("deleteUser error:", err);
    res.status(500).json({ error: "Failed to delete user." });
  } finally {
    client.release();
  }
};

