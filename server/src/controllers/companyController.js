import { query } from "../config/db.js";

export const getCompanies = async (req, res) => {
  try {
    const result = await query("SELECT * FROM companies ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("getCompanies error:", err);
    res.status(500).json({ error: "Failed to fetch companies." });
  }
};

export const getCompanyBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await query("SELECT * FROM companies WHERE slug = $1 OR id = $1", [slug]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Company not found." });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("getCompanyBySlug error:", err);
    res.status(500).json({ error: "Failed to fetch company." });
  }
};

export const createCompany = async (req, res) => {
  try {
    const { name, slug, domain, plan = "basic" } = req.body;
    const id = "comp_" + Math.random().toString(36).substr(2, 9);

    const result = await query(
      `INSERT INTO companies (id, name, slug, domain, plan)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, name, slug || id, domain || null, plan]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("createCompany error:", err);
    res.status(500).json({ error: "Failed to create company." });
  }
};

export const getRoles = async (req, res) => {
  try {
    const { companyId } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;
    const result = await query("SELECT * FROM roles WHERE company_id = $1 ORDER BY name ASC", [targetCompanyId]);
    res.json(result.rows);
  } catch (err) {
    console.error("getRoles error:", err);
    res.status(500).json({ error: "Failed to fetch roles." });
  }
};

export const getEnvironmentSettings = async (req, res) => {
  try {
    const { companyId } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;
    const result = await query("SELECT * FROM environment_settings WHERE company_id = $1", [targetCompanyId]);
    res.json(result.rows);
  } catch (err) {
    console.error("getEnvironmentSettings error:", err);
    res.status(500).json({ error: "Failed to fetch environment settings." });
  }
};
