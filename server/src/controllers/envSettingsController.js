import { query } from "../config/db.js";

export const getEnvSettings = async (req, res) => {
  try {
    const { companyId } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = "SELECT * FROM environment_settings WHERE 1=1";
    const params = [];

    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND company_id = $${params.length}`;
    }

    sql += " ORDER BY created_at DESC";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getEnvSettings error:", err);
    res.status(500).json({ error: "Failed to fetch environment settings." });
  }
};

export const createEnvSetting = async (req, res) => {
  try {
    const { key, value, description = "", status = "active", companyId } = req.body;
    const targetCompanyId = companyId || req.user?.companyId;

    if (!key) {
      return res.status(400).json({ error: "Setting key is required." });
    }

    const id = "env_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const result = await query(
      `INSERT INTO environment_settings (id, company_id, key, value, description, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, targetCompanyId, key, value, description, status]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("createEnvSetting error:", err);
    res.status(500).json({ error: "Failed to create environment setting." });
  }
};

export const updateEnvSetting = async (req, res) => {
  try {
    const { id } = req.params;
    const { key, value, description, status } = req.body;

    const result = await query(
      `UPDATE environment_settings
       SET key = COALESCE($1, key),
           value = COALESCE($2, value),
           description = COALESCE($3, description),
           status = COALESCE($4, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [key, value, description, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Setting not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("updateEnvSetting error:", err);
    res.status(500).json({ error: "Failed to update environment setting." });
  }
};

export const deleteEnvSetting = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("DELETE FROM environment_settings WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Setting not found." });
    }
    res.json({ message: "Setting deleted successfully.", id });
  } catch (err) {
    console.error("deleteEnvSetting error:", err);
    res.status(500).json({ error: "Failed to delete environment setting." });
  }
};
