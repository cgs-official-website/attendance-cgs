import { query } from "../config/db.js";
import auditService from "../services/auditService.js";

export const getTasks = async (req, res) => {
  try {
    const { companyId, projectId, assigneeId, status } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = `
      SELECT t.*, t.id as "_id", t.assigned_to as assignee_id, t.assigned_to as "assigneeId",
             u.name as assignee_name, u.name as "assigneeName", u.email as assignee_email,
             p.name as project_name, p.name as "projectName"
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND t.company_id = $${params.length}`;
    }

    if (projectId) {
      params.push(projectId);
      sql += ` AND t.project_id = $${params.length}`;
    }

    if (req.user?.role === "employee") {
      params.push(req.user.id);
      sql += ` AND t.assigned_to = $${params.length}`;
    } else if (assigneeId) {
      params.push(assigneeId);
      sql += ` AND t.assigned_to = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND t.status = $${params.length}`;
    }

    sql += " ORDER BY t.created_at DESC LIMIT 500";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getTasks error:", err);
    res.status(500).json({ error: "Failed to fetch tasks." });
  }
};

export const createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      projectId,
      assigneeId,
      assignedTo,
      priority = "medium",
      dueDate,
      companyId
    } = req.body;

    const targetCompanyId = companyId || req.user?.companyId;
    const creatorId = req.user?.id || null;
    const targetAssignee = assigneeId || assignedTo || null;

    if (!title) {
      return res.status(400).json({ error: "Task title is required." });
    }

    const id = "task_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const result = await query(
      `INSERT INTO tasks (id, company_id, project_id, title, description, assigned_to, created_by, priority, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING *`,
      [id, targetCompanyId, projectId || null, title, description || "", targetAssignee, creatorId, priority, dueDate || null]
    );

    const taskRow = result.rows[0];
    const io = req.app?.get("io");
    if (io) {
      if (targetCompanyId) io.to(`company_${targetCompanyId}`).emit("task_created", taskRow);
      if (targetAssignee) io.to(`user_${targetAssignee}`).emit("task_created", taskRow);
      io.emit("task_created", taskRow);
    }

    auditService.logAudit({
      userId: creatorId,
      action: "TASK_CREATE",
      resourceType: "task",
      resourceId: taskRow.id,
      details: { title: taskRow.title, priority: taskRow.priority, assignedTo: targetAssignee, projectId },
      req
    });

    res.status(201).json(taskRow);
  } catch (err) {
    console.error("createTask error:", err);
    res.status(500).json({ error: "Failed to create task." });
  }
};

export const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    const allowed = [
      "title", "description", "project_id", "assigned_to", "status",
      "priority", "due_date", "metadata"
    ];

    for (const key of Object.keys(updates)) {
      let snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (key === "assigneeId") snakeKey = "assigned_to";
      if (key === "projectId") snakeKey = "project_id";
      if (key === "dueDate") snakeKey = "due_date";

      if (allowed.includes(snakeKey)) {
        fields.push(`${snakeKey} = $${idx}`);
        values.push(updates[key]);
        idx++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No valid fields provided." });
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    const sql = `UPDATE tasks SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found." });
    }

    const updatedTask = result.rows[0];
    const io = req.app?.get("io");
    if (io) {
      if (updatedTask.company_id) io.to(`company_${updatedTask.company_id}`).emit("task_updated", updatedTask);
      if (updatedTask.assigned_to) io.to(`user_${updatedTask.assigned_to}`).emit("task_updated", updatedTask);
      io.emit("task_updated", updatedTask);
    }

    auditService.logAudit({
      userId: req.user?.id,
      action: "TASK_UPDATE",
      resourceType: "task",
      resourceId: id,
      details: { fieldsUpdated: Object.keys(updates), title: updatedTask.title, status: updatedTask.status },
      req
    });

    res.json(updatedTask);
  } catch (err) {
    console.error("updateTask error:", err);
    res.status(500).json({ error: "Failed to update task." });
  }
};

export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("DELETE FROM tasks WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found." });
    }

    const io = req.app?.get("io");
    if (io) {
      io.emit("task_deleted", { id });
    }

    res.json({ message: "Task deleted successfully.", id });
  } catch (err) {
    console.error("deleteTask error:", err);
    res.status(500).json({ error: "Failed to delete task." });
  }
};

export const startTaskTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date().toISOString();

    const existing = await query("SELECT * FROM tasks WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Task not found." });
    }

    const task = existing.rows[0];
    const meta = (task.metadata && typeof task.metadata === "object") ? task.metadata : {};
    meta.timerStartedAt = now;

    const result = await query(
      `UPDATE tasks
       SET metadata = $1, status = 'in-progress', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(meta), id]
    );

    const timerPayload = {
      ...result.rows[0],
      timerStartedAt: now,
      status: "in-progress"
    };

    const io = req.app?.get("io");
    if (io) {
      if (task.company_id) io.to(`company_${task.company_id}`).emit("task_timer_started", timerPayload);
      if (task.assigned_to) io.to(`user_${task.assigned_to}`).emit("task_timer_started", timerPayload);
      io.emit("task_timer_started", timerPayload);
    }

    res.json(timerPayload);
  } catch (err) {
    console.error("startTaskTimer error:", err);
    res.status(500).json({ error: "Failed to start task timer." });
  }
};

export const stopTaskTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const { reportText = "", content = "", timeSpentMinutes = 0 } = req.body || {};
    const userId = req.user?.id || req.body?.userId;

    const existing = await query("SELECT * FROM tasks WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Task not found." });
    }

    const task = existing.rows[0];
    const meta = (task.metadata && typeof task.metadata === "object") ? task.metadata : {};
    
    let computedMinutes = Number(timeSpentMinutes || 0);
    if (!computedMinutes && meta.timerStartedAt) {
      const startMs = new Date(meta.timerStartedAt).getTime();
      computedMinutes = Math.max(1, Math.round((Date.now() - startMs) / 60000));
    }
    meta.timerStartedAt = null;

    const result = await query(
      `UPDATE tasks
       SET metadata = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(meta), id]
    );

    const text = reportText || content;
    let savedReport = null;
    if (text || computedMinutes > 0) {
      const repId = "tr_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      const repRes = await query(
        `INSERT INTO task_reports (id, task_id, user_id, company_id, content, time_spent_minutes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [repId, id, userId || task.assigned_to, task.company_id, text || "Timer session completed", computedMinutes]
      );
      savedReport = repRes.rows[0];
    }

    const stopPayload = {
      ...result.rows[0],
      timerStartedAt: null,
      report: savedReport
    };

    const io = req.app?.get("io");
    if (io) {
      if (task.company_id) io.to(`company_${task.company_id}`).emit("task_timer_stopped", stopPayload);
      if (task.assigned_to) io.to(`user_${task.assigned_to}`).emit("task_timer_stopped", stopPayload);
      io.emit("task_timer_stopped", stopPayload);
    }

    res.json(stopPayload);
  } catch (err) {
    console.error("stopTaskTimer error:", err);
    res.status(500).json({ error: "Failed to stop task timer." });
  }
};
