import { query } from "../config/db.js";

export const getPayroll = async (req, res) => {
  try {
    const { companyId, month, year, userId } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = `
      SELECT p.*, p.id as "_id", p.employee_id as "userId", p.basic_salary as "basicSalary",
             p.gross_salary as "grossSalary", p.net_salary as "netSalary",
             p.pf_deduction as "pf", p.esi_deduction as "esi", p.tax_deduction as "pt",
             p.paid_days as "paidDays", p.present_days as "presentDays",
             u.name as employee_name, u.name as "employeeName", u.email as employee_email,
             u.department, u.designation, u.employee_id as "employeeCode"
      FROM payroll p
      JOIN users u ON p.employee_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND p.company_id = $${params.length}`;
    }
    if (month) {
      params.push(month);
      sql += ` AND p.month = $${params.length}`;
    }
    if (year) {
      params.push(Number(year));
      sql += ` AND p.year = $${params.length}`;
    }
    if (userId) {
      params.push(userId);
      sql += ` AND p.employee_id = $${params.length}`;
    } else if (req.user?.role === "employee") {
      params.push(req.user.id);
      sql += ` AND p.employee_id = $${params.length}`;
    }

    sql += " ORDER BY u.name ASC";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getPayroll error:", err);
    res.status(500).json({ error: "Failed to fetch payroll records." });
  }
};

export const savePayroll = async (req, res) => {
  try {
    const {
      userId,
      employeeId,
      month,
      year,
      grossSalary = 0,
      basicSalary = 0,
      hra = 0,
      allowances = 0,
      pf = 0,
      esi = 0,
      pt = 0,
      totalDeductions = 0,
      netSalary = 0,
      paidDays = 30,
      presentDays = 30,
      status = "generated",
      companyId
    } = req.body;

    const targetEmpId = userId || employeeId;
    const targetCompanyId = companyId || req.user?.companyId;
    const id = `payroll_${targetEmpId}_${month}_${year}`;

    const result = await query(
      `INSERT INTO payroll (id, company_id, employee_id, month, year, basic_salary, hra, allowances, gross_salary, pf_deduction, esi_deduction, tax_deduction, total_deductions, net_salary, paid_days, present_days, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET
         basic_salary = EXCLUDED.basic_salary,
         hra = EXCLUDED.hra,
         allowances = EXCLUDED.allowances,
         gross_salary = EXCLUDED.gross_salary,
         pf_deduction = EXCLUDED.pf_deduction,
         esi_deduction = EXCLUDED.esi_deduction,
         tax_deduction = EXCLUDED.tax_deduction,
         total_deductions = EXCLUDED.total_deductions,
         net_salary = EXCLUDED.net_salary,
         paid_days = EXCLUDED.paid_days,
         present_days = EXCLUDED.present_days,
         status = EXCLUDED.status,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        id, targetCompanyId, targetEmpId, month, Number(year), Number(basicSalary), Number(hra),
        Number(allowances), Number(grossSalary), Number(pf), Number(esi), Number(pt),
        Number(totalDeductions), Number(netSalary), Number(paidDays), Number(presentDays), status
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("savePayroll error:", err);
    res.status(500).json({ error: "Failed to save payroll record." });
  }
};

export const deletePayroll = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("DELETE FROM payroll WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Payroll record not found." });
    }
    res.json({ message: "Payroll record deleted successfully.", id });
  } catch (err) {
    console.error("deletePayroll error:", err);
    res.status(500).json({ error: "Failed to delete payroll record." });
  }
};
