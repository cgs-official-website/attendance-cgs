import { query } from "../config/db.js";
import { sendPayslipNotification } from "../services/emailService.js";

export const getPayroll = async (req, res) => {
  try {
    const { companyId, month, year, userId, employeeId } = req.query;
    const isSuperAdmin = req.user?.role?.toLowerCase() === "superadmin";
    const targetCompanyId = (isSuperAdmin && companyId) ? companyId : req.user?.companyId;
    const targetEmpId = userId || employeeId;

    let sql = `
      SELECT p.*,
             u.name as employee_name, u.name as "employeeName",
             u.email as employee_email, u.email as "employeeEmail",
             u.department, u.designation, u.employee_id as "employeeCode",
             u.phone as "employeePhone", u.avatar_url as "avatarUrl",
             u.metadata as "userMetadata"
      FROM payroll p
      LEFT JOIN users u ON p.employee_id = u.id
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
    if (req.user?.role === "employee") {
      params.push(req.user.id);
      sql += ` AND p.employee_id = $${params.length}`;
    } else if (targetEmpId) {
      params.push(targetEmpId);
      sql += ` AND p.employee_id = $${params.length}`;
    }

    sql += " ORDER BY COALESCE(u.name, p.employee_id) ASC";
    const result = await query(sql, params);

    const mappedRows = result.rows.map(row => {
      const meta = (typeof row.metadata === "object" && row.metadata !== null) ? row.metadata : {};
      const gross = Number(row.gross_salary || 0);
      const basic = Number(row.basic_salary || 0);
      const hra = Number(row.hra || 0);
      const allowances = Number(row.allowances || 0);
      const pf = Number(row.pf_deduction || 0);
      const esi = Number(row.esi_deduction || 0);
      const pt = Number(row.tax_deduction || 0);
      const totalDeductions = Number(row.total_deductions || 0);
      const net = Number(row.net_salary || 0);
      const paidDays = Number(row.paid_days !== null && row.paid_days !== undefined ? row.paid_days : 30);
      const presentDays = Number(row.present_days !== null && row.present_days !== undefined ? row.present_days : 30);
      const workingDays = Number(meta.workingDays !== undefined ? meta.workingDays : 30);
      const lopAmount = Number(meta.lopAmount || 0);
      const lopsDays = Number(meta.lopsDays || 0);
      const tds = Number(meta.tds || 0);
      const insurance = Number(meta.insurance || 0);
      const special = allowances || Number(meta.special || 0);
      const userMeta = (typeof row.userMetadata === "object" && row.userMetadata !== null) ? row.userMetadata : {};
      const bankAccountNumber = userMeta.bankAccountNumber || userMeta.bankAccount || "";
      const panNumber = userMeta.panNumber || userMeta.pan || "";
      const pfNumber = userMeta.pfNumber || userMeta.pfUan || "";
      const esiNumber = userMeta.esiNumber || "";
      const joiningDate = userMeta.joiningDate || userMeta.doj || "";

      return {
        ...meta,
        ...row,
        id: row.id,
        _id: row.id,
        companyId: row.company_id,
        company_id: row.company_id,
        employeeId: row.employee_id,
        employee_id: row.employee_id,
        userId: row.employee_id,
        month: row.month,
        year: Number(row.year),
        grossSalary: gross,
        gross: gross,
        basicSalary: basic,
        basic: basic,
        hra: hra,
        allowances: allowances,
        special: special,
        pf: pf,
        esi: esi,
        pt: pt,
        tds: tds,
        insurance: insurance,
        lopAmount: lopAmount,
        lopsDays: lopsDays,
        workingDays: workingDays,
        totalDeductions: totalDeductions,
        netSalary: net,
        net: net,
        paidDays: paidDays,
        presentDays: presentDays,
        status: row.status || "generated",
        bankAccountNumber,
        panNumber,
        pfNumber,
        esiNumber,
        joiningDate
      };
    });

    res.json(mappedRows);
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
      grossSalary,
      gross,
      basicSalary,
      basic,
      hra = 0,
      allowances,
      special,
      pf = 0,
      esi = 0,
      pt = 0,
      tds = 0,
      insurance = 0,
      lopAmount = 0,
      lopsDays = 0,
      totalDeductions,
      netSalary,
      net,
      paidDays = 30,
      presentDays = 30,
      workingDays = 30,
      status = "generated",
      companyId
    } = req.body;

    const targetEmpId = userId || employeeId;
    const targetCompanyId = companyId || req.user?.companyId;

    if (!targetEmpId || !month || !year) {
      return res.status(400).json({ error: "Employee ID, month, and year are required." });
    }

    const id = `payroll_${targetEmpId}_${month}_${year}`;

    const numGross = Number(grossSalary !== undefined ? grossSalary : (gross !== undefined ? gross : 0));
    const numBasic = Number(basicSalary !== undefined ? basicSalary : (basic !== undefined ? basic : 0));
    const numHra = Number(hra || 0);
    const numAllowances = Number(allowances !== undefined ? allowances : (special !== undefined ? special : 0));
    const numPf = Number(pf || 0);
    const numEsi = Number(esi || 0);
    const numPt = Number(pt || 0);
    const numTds = Number(tds || 0);
    const numInsurance = Number(insurance || 0);
    const numLopAmount = Number(lopAmount || 0);
    const numLopsDays = Number(lopsDays || 0);
    const numPaidDays = Number(paidDays !== undefined ? paidDays : 30);
    const numPresentDays = Number(presentDays !== undefined ? presentDays : 30);
    const numWorkingDays = Number(workingDays !== undefined ? workingDays : 30);

    const calculatedDeductions = numPf + numEsi + numPt + numTds + numInsurance + numLopAmount;
    const numTotalDeductions = Number(totalDeductions !== undefined ? totalDeductions : calculatedDeductions);
    const numNet = Number(netSalary !== undefined ? netSalary : (net !== undefined ? net : (numGross - numTotalDeductions)));

    const metadata = {
      workingDays: numWorkingDays,
      lopAmount: numLopAmount,
      lopsDays: numLopsDays,
      tds: numTds,
      insurance: numInsurance,
      special: numAllowances
    };

    const result = await query(
      `INSERT INTO payroll (id, company_id, employee_id, month, year, basic_salary, hra, allowances, gross_salary, pf_deduction, esi_deduction, tax_deduction, total_deductions, net_salary, paid_days, present_days, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (id) DO UPDATE SET
         company_id = EXCLUDED.company_id,
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
         metadata = EXCLUDED.metadata,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        id, targetCompanyId, targetEmpId, month, Number(year), numBasic, numHra,
        numAllowances, numGross, numPf, numEsi, numPt,
        numTotalDeductions, numNet, numPaidDays, numPresentDays, status,
        JSON.stringify(metadata)
      ]
    );

    const row = result.rows[0];
    res.status(201).json({
      ...metadata,
      ...row,
      id: row.id,
      _id: row.id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      userId: row.employee_id,
      grossSalary: Number(row.gross_salary),
      gross: Number(row.gross_salary),
      basicSalary: Number(row.basic_salary),
      basic: Number(row.basic_salary),
      netSalary: Number(row.net_salary),
      net: Number(row.net_salary),
      pf: Number(row.pf_deduction),
      esi: Number(row.esi_deduction),
      pt: Number(row.tax_deduction),
      totalDeductions: Number(row.total_deductions),
      paidDays: Number(row.paid_days),
      workingDays: numWorkingDays
    });
  } catch (err) {
    console.error("savePayroll error:", err);
    res.status(500).json({ error: "Failed to save payroll record." });
  }
};

export const deletePayroll = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId, employeeId, userId, month, year } = req.query;

    let result;
    if (id && id !== "undefined" && id !== "null") {
      result = await query("DELETE FROM payroll WHERE id = $1 RETURNING id", [id]);
    } else {
      const targetEmp = userId || employeeId;
      const targetComp = companyId || req.user?.companyId;
      let sql = "DELETE FROM payroll WHERE 1=1";
      const params = [];
      if (targetComp) {
        params.push(targetComp);
        sql += ` AND company_id = $${params.length}`;
      }
      if (targetEmp) {
        params.push(targetEmp);
        sql += ` AND employee_id = $${params.length}`;
      }
      if (month) {
        params.push(month);
        sql += ` AND month = $${params.length}`;
      }
      if (year) {
        params.push(Number(year));
        sql += ` AND year = $${params.length}`;
      }
      sql += " RETURNING id";
      result = await query(sql, params);
    }

    if (!result || result.rows.length === 0) {
      return res.status(404).json({ error: "Payroll record not found." });
    }
    res.json({ message: "Payroll record deleted successfully.", id: result.rows[0].id });
  } catch (err) {
    console.error("deletePayroll error:", err);
    res.status(500).json({ error: "Failed to delete payroll record." });
  }
};

export const wipeAllPayrolls = async (req, res) => {
  try {
    const { companyId, month, year } = req.query;
    const isSuperAdmin = req.user?.role?.toLowerCase() === "superadmin";
    const targetComp = (isSuperAdmin && companyId) ? companyId : req.user?.companyId;

    if (!targetComp && !isSuperAdmin) {
      return res.status(400).json({ error: "Company ID is required to wipe payroll." });
    }

    let sql = "DELETE FROM payroll WHERE 1=1";
    const params = [];

    if (targetComp) {
      params.push(targetComp);
      sql += ` AND company_id = $${params.length}`;
    }
    if (month) {
      params.push(month);
      sql += ` AND month = $${params.length}`;
    }
    if (year) {
      params.push(Number(year));
      sql += ` AND year = $${params.length}`;
    }
    sql += " RETURNING id";

    const result = await query(sql, params);
    res.json({ message: `Wiped ${result.rows.length} payroll records.`, count: result.rows.length });
  } catch (err) {
    console.error("wipeAllPayrolls error:", err);
    res.status(500).json({ error: "Failed to wipe payroll records." });
  }
};

export const calculatePayrollBatch = async (req, res) => {
  try {
    const { companyId, month, year, workingDays = 30 } = req.body;
    const isSuperAdmin = req.user?.role?.toLowerCase() === "superadmin";
    const targetCompanyId = (isSuperAdmin && companyId) ? companyId : req.user?.companyId;

    if (!month || !year) {
      return res.status(400).json({ error: "Month and Year are required for payroll calculation." });
    }

    // 1. Fetch all active employees in this company
    let userSql = "SELECT id, name, email, gross_salary, metadata FROM users WHERE role != 'superadmin' AND (metadata->>'status' IS NULL OR metadata->>'status' != 'inactive')";
    const userParams = [];
    if (targetCompanyId) {
      userParams.push(targetCompanyId);
      userSql += ` AND company_id = $${userParams.length}`;
    }
    const employees = await query(userSql, userParams);

    if (employees.rows.length === 0) {
      return res.status(400).json({ error: "No active employees found for this company." });
    }

    const calculatedRecords = [];
    const wDays = Number(workingDays) || 30;

    for (const emp of employees.rows) {
      const gross = Number(emp.gross_salary || 30000);

      const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
      let mIdx = monthNames.indexOf(String(month).toLowerCase());
      let monthNumberStr = mIdx !== -1 ? String(mIdx + 1).padStart(2, '0') : String(month).padStart(2, '0');
      const datePrefix = `${year}-${monthNumberStr}`;

      const attRes = await query(
        `SELECT COUNT(*) as count, status FROM attendance 
         WHERE user_id = $1 AND date LIKE $2 
         GROUP BY status`,
        [emp.id, `${datePrefix}%`]
      ).catch(() => ({ rows: [] }));

      let presentCount = 0;
      let onLeaveCount = 0;
      attRes.rows.forEach(r => {
        const count = Number(r.count || 0);
        if (r.status === "present") presentCount += count;
        else if (r.status === "half-day") presentCount += (count * 0.5);
        else if (r.status === "on-leave") onLeaveCount += count;
      });

      const loggedDays = presentCount + onLeaveCount;
      const paidDays = loggedDays > 0 ? Math.min(wDays, loggedDays) : wDays;
      const lopsDays = Math.max(0, wDays - paidDays);

      const actualGross = Math.round(((gross / wDays) * paidDays) * 100) / 100;
      const lopAmount = Math.round((gross - actualGross) * 100) / 100;

      const basic = Math.round((gross * 0.5) * 100) / 100;
      const hra = Math.round((basic * 0.4) * 100) / 100;
      const special = Math.round(Math.max(0, gross - basic - hra) * 100) / 100;

      const actualBasic = Math.round((actualGross * 0.5) * 100) / 100;
      const pf = Math.round((actualBasic * 0.12) * 100) / 100;
      const esi = actualGross <= 21000 ? Math.round((actualGross * 0.0075) * 100) / 100 : 0;

      let pt = 0;
      if (actualGross > 75000) pt = 208.33;
      else if (actualGross > 60000) pt = 170.83;
      else if (actualGross > 45000) pt = 155;
      else if (actualGross > 30000) pt = 70.83;
      else if (actualGross > 21000) pt = 30;

      const tds = actualGross > 50000 ? Math.round(((actualGross - pf - pt) * 0.05) * 100) / 100 : 0;
      const totalDeductions = Math.round((pf + esi + pt + tds + lopAmount) * 100) / 100;
      const netSalary = Math.round(Math.max(0, actualGross - (pf + esi + pt + tds)) * 100) / 100;

      const metadata = {
        workingDays: wDays,
        lopAmount,
        lopsDays,
        tds,
        special,
        calculatedAt: new Date().toISOString()
      };

      const recordId = `payroll_${emp.id}_${month}_${year}`;
      await query(
        `INSERT INTO payroll (id, company_id, employee_id, month, year, basic_salary, hra, allowances, gross_salary, pf_deduction, esi_deduction, tax_deduction, total_deductions, net_salary, paid_days, present_days, status, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'draft', $17)
         ON CONFLICT (id) DO UPDATE SET
           company_id = EXCLUDED.company_id,
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
           status = 'draft',
           metadata = EXCLUDED.metadata,
           updated_at = CURRENT_TIMESTAMP`,
        [
          recordId, targetCompanyId, emp.id, month, Number(year),
          basic, hra, special, gross, pf, esi, pt, totalDeductions, netSalary,
          paidDays, presentCount || paidDays, JSON.stringify(metadata)
        ]
      );

      calculatedRecords.push({
        id: recordId,
        employeeId: emp.id,
        employeeName: emp.name,
        month,
        year: Number(year),
        grossSalary: gross,
        netSalary,
        basicSalary: basic,
        totalDeductions,
        paidDays,
        status: "draft"
      });
    }

    res.json({
      message: `Calculated payroll for ${calculatedRecords.length} employees.`,
      count: calculatedRecords.length,
      payrolls: calculatedRecords
    });
  } catch (err) {
    console.error("calculatePayrollBatch error:", err);
    res.status(500).json({ error: "Failed to calculate payroll batch." });
  }
};

export const approvePayrollBatch = async (req, res) => {
  try {
    const { companyId, month, year } = req.body;
    const isSuperAdmin = req.user?.role?.toLowerCase() === "superadmin";
    const targetCompanyId = (isSuperAdmin && companyId) ? companyId : req.user?.companyId;

    if (!month || !year) {
      return res.status(400).json({ error: "Month and Year are required to approve payroll." });
    }

    // 1. Fetch matching draft payroll records with employee details
    let sql = `
      SELECT p.*, u.name as employee_name, u.email as employee_email
      FROM payroll p
      LEFT JOIN users u ON p.employee_id = u.id
      WHERE p.month = $1 AND p.year = $2
    `;
    const params = [month, Number(year)];
    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND p.company_id = $${params.length}`;
    }

    const records = await query(sql, params);
    if (records.rows.length === 0) {
      return res.status(404).json({ error: "No payroll records found for the specified period." });
    }

    // 2. Update status to 'paid'
    let updateSql = "UPDATE payroll SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE month = $1 AND year = $2";
    const updateParams = [month, Number(year)];
    if (targetCompanyId) {
      updateParams.push(targetCompanyId);
      updateSql += ` AND company_id = $${updateParams.length}`;
    }
    await query(updateSql, updateParams);

    const io = req.app?.get("io");

    // 3. For each employee, create in-app notification & dispatch email
    for (const r of records.rows) {
      const notifId = "notif_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      const title = `Payslip Available: ${r.month} ${r.year}`;
      const message = `Your salary payslip for ${r.month} ${r.year} is approved. Net Pay: ₹${Number(r.net_salary).toLocaleString("en-IN")}.`;
      
      await query(
        `INSERT INTO notifications (id, user_id, title, message, type, read, link)
         VALUES ($1, $2, $3, $4, 'payroll', false, '/dashboard?tab=payroll')
         ON CONFLICT (id) DO NOTHING`,
        [notifId, r.employee_id, title, message]
      ).catch(() => {});

      if (io) {
        io.emit(`notification_${r.employee_id}`, {
          id: notifId,
          userId: r.employee_id,
          title,
          message,
          type: "payroll",
          read: false,
          link: "/dashboard?tab=payroll",
          createdAt: new Date().toISOString()
        });
      }

      if (r.employee_email) {
        sendPayslipNotification({
          email: r.employee_email,
          name: r.employee_name || "Employee",
          month: r.month,
          year: r.year,
          netSalary: r.net_salary,
          grossSalary: r.gross_salary,
          totalDeductions: r.total_deductions,
          paidDays: r.paid_days || 30
        }).catch(emailErr => console.warn("Payslip email dispatch non-blocking error:", emailErr.message));
      }
    }

    res.json({
      message: `Approved and processed ${records.rows.length} payslips.`,
      count: records.rows.length
    });
  } catch (err) {
    console.error("approvePayrollBatch error:", err);
    res.status(500).json({ error: "Failed to approve payroll batch." });
  }
};


