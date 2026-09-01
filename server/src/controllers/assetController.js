import { query } from "../config/db.js";

export const getAssets = async (req, res) => {
  try {
    const { companyId, status, category } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = `
      SELECT a.*, a.id as "_id", a.assigned_to as assigned_user_id, a.assigned_to as "assignedUser",
             u.name as assigned_user_name, u.name as "assignedUserName", u.email as assigned_user_email
      FROM assets a
      LEFT JOIN users u ON a.assigned_to = u.id
      WHERE 1=1
    `;
    const params = [];

    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND a.company_id = $${params.length}`;
    }
    if (status && status !== "all") {
      params.push(status);
      sql += ` AND a.status = $${params.length}`;
    }

    sql += " ORDER BY a.created_at DESC";
    const result = await query(sql, params);
    
    // Camelcase mapping for frontend
    const assets = result.rows.map(r => ({
      ...r,
      serialNumber: r.serial_number,
      assignedUser: r.assigned_to,
      assignedDate: r.purchase_date,
      category: typeof r.category === "string" ? [r.category] : (r.category || ["Laptop"])
    }));

    res.json(assets);
  } catch (err) {
    console.error("getAssets error:", err);
    res.status(500).json({ error: "Failed to fetch assets." });
  }
};

export const createAsset = async (req, res) => {
  try {
    const {
      name,
      category = ["Laptop"],
      serialNumber,
      status = "Available",
      assignedUserId,
      assignedUser,
      assignedDate,
      companyId
    } = req.body;

    const targetCompanyId = companyId || req.user?.companyId;
    const targetAssignee = assignedUserId || assignedUser || null;

    if (!name) {
      return res.status(400).json({ error: "Asset name is required." });
    }

    const id = "asset_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const catVal = Array.isArray(category) ? category[0] : category;

    const result = await query(
      `INSERT INTO assets (id, company_id, name, category, serial_number, status, assigned_to, purchase_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, targetCompanyId, name, catVal || "Laptop", serialNumber || "", status, targetAssignee, assignedDate || null]
    );

    const r = result.rows[0];
    res.status(201).json({
      ...r,
      serialNumber: r.serial_number,
      assignedUser: r.assigned_to,
      assignedDate: r.purchase_date,
      category: [r.category || "Laptop"]
    });
  } catch (err) {
    console.error("createAsset error:", err);
    res.status(500).json({ error: "Failed to create asset." });
  }
};

export const updateAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    const allowed = [
      "name", "category", "serial_number", "status", "assigned_to", "purchase_date", "metadata"
    ];

    for (const key of Object.keys(updates)) {
      let snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (key === "assignedUser" || key === "assignedUserId") snakeKey = "assigned_to";
      if (key === "assignedDate") snakeKey = "purchase_date";
      if (key === "serialNumber") snakeKey = "serial_number";

      if (allowed.includes(snakeKey)) {
        let val = updates[key];
        if (snakeKey === "category" && Array.isArray(val)) val = val[0];
        fields.push(`${snakeKey} = $${idx}`);
        values.push(val);
        idx++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No valid fields provided." });
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    const sql = `UPDATE assets SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Asset not found." });
    }

    const r = result.rows[0];
    res.json({
      ...r,
      serialNumber: r.serial_number,
      assignedUser: r.assigned_to,
      assignedDate: r.purchase_date,
      category: [r.category || "Laptop"]
    });
  } catch (err) {
    console.error("updateAsset error:", err);
    res.status(500).json({ error: "Failed to update asset." });
  }
};

export const deleteAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("DELETE FROM assets WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Asset not found." });
    }
    res.json({ message: "Asset deleted successfully.", id });
  } catch (err) {
    console.error("deleteAsset error:", err);
    res.status(500).json({ error: "Failed to delete asset." });
  }
};
