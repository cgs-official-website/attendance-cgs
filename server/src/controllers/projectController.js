import { query } from "../config/db.js";

// --- PROJECTS ---
export const getProjects = async (req, res) => {
  try {
    const { companyId } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = "SELECT * FROM projects WHERE 1=1";
    const params = [];

    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND company_id = $${params.length}`;
    }

    sql += " ORDER BY created_at DESC";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getProjects error:", err);
    res.status(500).json({ error: "Failed to fetch projects." });
  }
};

export const createProject = async (req, res) => {
  try {
    const { name, description, startDate, endDate, managerId, companyId } = req.body;
    const targetCompanyId = companyId || req.user?.companyId;
    const id = "proj_" + Math.random().toString(36).substr(2, 9);

    const result = await query(
      `INSERT INTO projects (id, company_id, name, description, start_date, end_date, manager_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, targetCompanyId, name, description || null, startDate || null, endDate || null, managerId || req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("createProject error:", err);
    res.status(500).json({ error: "Failed to create project." });
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
    const companyId = req.user.companyId;
    const id = "task_" + Math.random().toString(36).substr(2, 9);

    const result = await query(
      `INSERT INTO tasks (id, company_id, project_id, title, description, assigned_to, created_by, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, companyId, projectId || null, title, description || null, assignedTo || null, req.user.id, priority, dueDate || null]
    );

    res.status(201).json(result.rows[0]);
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
