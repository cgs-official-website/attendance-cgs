import { query } from "../config/db.js";

export const getCompanies = async (req, res) => {
  try {
    const result = await query("SELECT * FROM companies ORDER BY name ASC");
    res.json(result.rows.map(r => ({
      ...r,
      logoBase64: r.logo_url,
      settings: r.settings || {},
      modules: r.settings?.modules || ["attendance", "team-hub", "projects", "tasks", "assets", "payroll"]
    })));
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
    const r = result.rows[0];
    res.json({
      ...r,
      logoBase64: r.logo_url,
      settings: r.settings || {},
      modules: r.settings?.modules || ["attendance", "team-hub", "projects", "tasks", "assets", "payroll"]
    });
  } catch (err) {
    console.error("getCompanyBySlug error:", err);
    res.status(500).json({ error: "Failed to fetch company." });
  }
};

export const createCompany = async (req, res) => {
  try {
    const { name, slug, domain, plan = "basic", logoBase64, address, payrollSettings, modules } = req.body;
    const id = req.body.id || "comp_" + Math.random().toString(36).substr(2, 9);

    const settings = {
      address: address || "",
      payrollSettings: payrollSettings || { pf: true, esi: true, pt: true },
      modules: modules || ["attendance", "team-hub", "projects", "tasks", "assets", "payroll"]
    };

    const result = await query(
      `INSERT INTO companies (id, name, slug, domain, plan, logo_url, settings, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         domain = EXCLUDED.domain,
         logo_url = EXCLUDED.logo_url,
         settings = EXCLUDED.settings,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [id, name, slug || id, domain || null, plan, logoBase64 || null, JSON.stringify(settings)]
    );

    const r = result.rows[0];
    res.status(201).json({
      ...r,
      logoBase64: r.logo_url,
      settings: r.settings || {},
      modules: r.settings?.modules || ["attendance", "team-hub", "projects", "tasks", "assets", "payroll"]
    });
  } catch (err) {
    console.error("createCompany error:", err);
    res.status(500).json({ error: "Failed to create company." });
  }
};

export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, logoBase64, address, payrollSettings, modules, status } = req.body;

    const existing = await query("SELECT * FROM companies WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Company not found." });
    }

    const currentSettings = existing.rows[0].settings || {};
    if (address !== undefined) currentSettings.address = address;
    if (payrollSettings !== undefined) currentSettings.payrollSettings = payrollSettings;
    if (modules !== undefined) currentSettings.modules = modules;

    const result = await query(
      `UPDATE companies
       SET name = COALESCE($1, name),
           logo_url = COALESCE($2, logo_url),
           status = COALESCE($3, status),
           settings = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [name || null, logoBase64 || null, status || null, JSON.stringify(currentSettings), id]
    );

    const r = result.rows[0];
    res.json({
      ...r,
      logoBase64: r.logo_url,
      settings: r.settings || {},
      modules: r.settings?.modules || ["attendance", "team-hub", "projects", "tasks", "assets", "payroll"]
    });
  } catch (err) {
    console.error("updateCompany error:", err);
    res.status(500).json({ error: "Failed to update company." });
  }
};

export const getCompanyDomains = async (req, res) => {
  try {
    const { companyId } = req.query;
    let sql = "SELECT * FROM company_domains WHERE 1=1";
    const params = [];
    if (companyId) {
      params.push(companyId);
      sql += ` AND company_id = $${params.length}`;
    }
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getCompanyDomains error:", err);
    res.status(500).json({ error: "Failed to fetch company domains." });
  }
};
