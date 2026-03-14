import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { calculateAllPayroll } from '../services/payrollCalculator';

const router = Router();

// POST /api/payroll/calculate - 급여 자동 계산
router.post('/calculate', async (req: Request, res: Response) => {
  try {
    const { yearMonth, paymentDate } = req.body;
    if (!yearMonth) {
      res.status(400).json({ error: 'yearMonth 필수' });
      return;
    }

    const year = parseInt(yearMonth.split('-')[0], 10);
    const results = await calculateAllPayroll(year);

    // payrolls 테이블에 upsert
    const totalGross = results.reduce((s, r) => s + r.gross_pay, 0);
    const totalDeductions = results.reduce((s, r) => s + r.total_deductions, 0);
    const totalNet = results.reduce((s, r) => s + r.net_pay, 0);

    const payrollResult = await pool.query(
      `INSERT INTO payrolls (year_month, payment_date, status, total_gross, total_deductions, total_net)
       VALUES ($1, $2, 'draft', $3, $4, $5)
       ON CONFLICT (year_month) DO UPDATE SET
         payment_date = COALESCE($2, payrolls.payment_date),
         total_gross = $3, total_deductions = $4, total_net = $5,
         status = 'draft', updated_at = NOW()
       RETURNING *`,
      [yearMonth, paymentDate || null, totalGross, totalDeductions, totalNet]
    );
    const payroll = payrollResult.rows[0];

    // payroll_details upsert
    for (const r of results) {
      await pool.query(
        `INSERT INTO payroll_details (payroll_id, employee_id, base_salary, meal_allowance, car_allowance, childcare_allowance, gross_pay, national_pension, health_insurance, long_term_care, employment_insurance, income_tax, local_income_tax, total_deductions, net_pay)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (payroll_id, employee_id) DO UPDATE SET
           base_salary=$3, meal_allowance=$4, car_allowance=$5, childcare_allowance=$6,
           gross_pay=$7, national_pension=$8, health_insurance=$9, long_term_care=$10,
           employment_insurance=$11, income_tax=$12, local_income_tax=$13,
           total_deductions=$14, net_pay=$15`,
        [payroll.id, r.employee.id, r.base_salary, r.meal_allowance, r.car_allowance, r.childcare_allowance, r.gross_pay, r.national_pension, r.health_insurance, r.long_term_care, r.employment_insurance, r.income_tax, r.local_income_tax, r.total_deductions, r.net_pay]
      );
    }

    // 로그 기록
    await pool.query(
      `INSERT INTO payroll_logs (payroll_id, step, status, message) VALUES ($1, 'calculate', 'success', $2)`,
      [payroll.id, `${results.length}명 급여 계산 완료`]
    );

    res.json({
      payroll,
      details: results.map(r => ({
        employee_code: r.employee.employee_code,
        name: r.employee.name,
        ...r,
        employee: undefined,
      })),
    });
  } catch (err) {
    console.error('급여 계산 실패:', err);
    res.status(500).json({ error: '급여 계산 실패', message: String(err) });
  }
});

// GET /api/payroll/:yearMonth - 급여 대장 조회
router.get('/:yearMonth', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM payrolls WHERE year_month = $1', [req.params.yearMonth]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: '해당 월 급여 대장이 없습니다' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('급여 대장 조회 실패:', err);
    res.status(500).json({ error: '급여 대장 조회 실패' });
  }
});

// GET /api/payroll/:yearMonth/details - 직원별 상세
router.get('/:yearMonth/details', async (req: Request, res: Response) => {
  try {
    const payroll = await pool.query('SELECT id FROM payrolls WHERE year_month = $1', [req.params.yearMonth]);
    if (payroll.rows.length === 0) {
      res.status(404).json({ error: '해당 월 급여 대장이 없습니다' });
      return;
    }
    const details = await pool.query(
      `SELECT pd.*, e.employee_code, e.name, e.position, e.is_ceo
       FROM payroll_details pd
       JOIN employees e ON pd.employee_id = e.id
       WHERE pd.payroll_id = $1
       ORDER BY e.employee_code`,
      [payroll.rows[0].id]
    );
    res.json(details.rows);
  } catch (err) {
    console.error('급여 상세 조회 실패:', err);
    res.status(500).json({ error: '급여 상세 조회 실패' });
  }
});

export default router;
