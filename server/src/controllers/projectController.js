import { query } from "../config/db.js";
import { sendTaskAssignmentEmail } from "../services/emailService.js";

const formatDateStr = (val) => {
  if (!val) return "";
  if (typeof val === "string") return val.split("T")[0];
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().split("T")[0];
  return String(val);
};

const formatProjectRow = (row) => {
  const startDate = formatDateStr(row.start_date || row.startDate);
  const endDate = formatDateStr(row.end_date || row.endDate);
  const teamMembers = Array.isArray(row.team_members) ? row.team_members : (Array.isArray(row.teamMembers) ? row.teamMembers : []);

  return {
    ...row,
    id: row.id,
    _id: row.id,
    name: row.name,
    description: row.description || "",
    companyId: row.company_id,
    company_id: row.company_id,
    startDate,
    endDate,
    start_date: startDate,
    end_date: endDate,
    managerId: row.manager_id,
    manager_id: row.manager_id,
    managerName: row.manager_name || "",
    managerEmail: row.manager_email || "",
    status: row.status || "Ongoing",
    teamMembers,
    team_members: teamMembers,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// --- PROJECTS ---
export const getProjects = async (req, res) => {
  try {
    const { companyId } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = `
      SELECT p.*,
             u.name as manager_name,
             u.email as manager_email,
             COALESCE(
               (SELECT json_agg(pm.user_id) FROM project_members pm WHERE pm.project_id = p.id),
               '[]'::json
             ) as team_members
      FROM projects p
      LEFT JOIN users u ON p.manager_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND p.company_id = $${params.length}`;
    }

    sql += " ORDER BY p.created_at DESC";
    const result = await query(sql, params);
    res.json(result.rows.map(formatProjectRow));
  } catch (err) {
    console.error("getProjects error:", err);
    res.status(500).json({ error: "Failed to fetch projects." });
  }
};

export const createProject = async (req, res) => {
  try {
    const { name, description, startDate, endDate, managerId, companyId, teamMembers = [], status = "Ongoing" } = req.body;
    const targetCompanyId = companyId || req.user?.companyId;

    if (!name) {
      return res.status(400).json({ error: "Project name is required." });
    }

    const id = "proj_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const cleanStart = startDate ? formatDateStr(startDate) : null;
    const cleanEnd = endDate ? formatDateStr(endDate) : null;

    const result = await query(
      `INSERT INTO projects (id, company_id, name, description, start_date, end_date, manager_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, targetCompanyId, name, description || null, cleanStart, cleanEnd, managerId || req.user?.id || null, status]
    );

    const project = result.rows[0];

    // Insert team members if provided
    if (Array.isArray(teamMembers) && teamMembers.length > 0) {
      for (const memberId of teamMembers) {
        if (memberId) {
          await query(
            `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [id, memberId]
          ).catch(() => {});
        }
      }
    }

    res.status(201).json(formatProjectRow({ ...project, team_members: teamMembers }));
  } catch (err) {
    console.error("createProject error:", err);
    res.status(500).json({ error: "Failed to create project." });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, startDate, endDate, managerId, status, teamMembers } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(name);
    }
    if (description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(description);
    }
    if (startDate !== undefined) {
      fields.push(`start_date = $${idx++}`);
      values.push(startDate ? formatDateStr(startDate) : null);
    }
    if (endDate !== undefined) {
      fields.push(`end_date = $${idx++}`);
      values.push(endDate ? formatDateStr(endDate) : null);
    }
    if (managerId !== undefined) {
      fields.push(`manager_id = $${idx++}`);
      values.push(managerId);
    }
    if (status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(status);
    }

    if (fields.length > 0) {
      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);
      await query(`UPDATE projects SET ${fields.join(", ")} WHERE id = $${idx}`, values);
    }

    // Update team members if passed
    if (Array.isArray(teamMembers)) {
      await query(`DELETE FROM project_members WHERE project_id = $1`, [id]);
      for (const memberId of teamMembers) {
        if (memberId) {
          await query(
            `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [id, memberId]
          ).catch(() => {});
        }
      }
    }

    // Fetch updated project
    const fetchRes = await query(
      `SELECT p.*,
              u.name as manager_name,
              u.email as manager_email,
              COALESCE(
                (SELECT json_agg(pm.user_id) FROM project_members pm WHERE pm.project_id = p.id),
                '[]'::json
              ) as team_members
       FROM projects p
       LEFT JOIN users u ON p.manager_id = u.id
       WHERE p.id = $1`,
      [id]
    );

    if (fetchRes.rows.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }

    res.json(formatProjectRow(fetchRes.rows[0]));
  } catch (err) {
    console.error("updateProject error:", err);
    res.status(500).json({ error: "Failed to update project." });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM project_members WHERE project_id = $1", [id]);
    const result = await query("DELETE FROM projects WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }
    res.json({ message: "Project deleted successfully.", id });
  } catch (err) {
    console.error("deleteProject error:", err);
    res.status(500).json({ error: "Failed to delete project." });
  }
};

export const addProjectMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required." });

    await query(
      `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, userId]
    );
    res.json({ success: true, projectId: id, userId });
  } catch (err) {
    console.error("addProjectMember error:", err);
    res.status(500).json({ error: "Failed to add project member." });
  }
};

// --- TASKS ---
export const getTasks = async (req, res) => {
  try {
    const { companyId, projectId, assignedTo } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = "SELECT * FROM tasks WHERE 1=1";
    const params = [];

    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND company_id = $${params.length}`;
    }

    if (projectId) {
      params.push(projectId);
      sql += ` AND project_id = $${params.length}`;
    }

    if (assignedTo) {
      params.push(assignedTo);
      sql += ` AND assigned_to = $${params.length}`;
    }

    sql += " ORDER BY created_at DESC";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getTasks error:", err);
    res.status(500).json({ error: "Failed to fetch tasks." });
  }
};

export const createTask = async (req, res) => {
  try {
    const { title, description, projectId, assignedTo, priority = "medium", dueDate } = req.body;
    const companyId = req.user?.companyId;
    const id = "task_" + Math.random().toString(36).substr(2, 9);

    const result = await query(
      `INSERT INTO tasks (id, company_id, project_id, title, description, assigned_to, created_by, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, companyId, projectId || null, title, description || null, assignedTo || null, req.user.id, priority, dueDate || null]
    );

    const task = result.rows[0];

    // Asynchronously notify assignee if assigned
    if (assignedTo) {
      (async () => {
        try {
          const userRes = await query("SELECT email, name FROM users WHERE id = $1", [assignedTo]);
          if (userRes.rows.length > 0) {
            let projectName = null;
            if (projectId) {
              const pRes = await query("SELECT name FROM projects WHERE id = $1", [projectId]);
              projectName = pRes.rows[0]?.name;
            }
            sendTaskAssignmentEmail({
              email: userRes.rows[0].email,
              name: userRes.rows[0].name,
              taskTitle: title,
              description,
              priority,
              dueDate,
              projectName
            }).catch(() => {});
          }
        } catch (e) {
          console.error("Error dispatching task email:", e);
        }
      })();
    }

    res.status(201).json(task);
  } catch (err) {
    console.error("createTask error:", err);
    res.status(500).json({ error: "Failed to create task." });
  }
};

export const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, description } = req.body;

    const result = await query(
      `UPDATE tasks
       SET status = COALESCE($1, status),
           priority = COALESCE($2, priority),
           description = COALESCE($3, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status || null, priority || null, description || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("updateTask error:", err);
    res.status(500).json({ error: "Failed to update task." });
  }
};
