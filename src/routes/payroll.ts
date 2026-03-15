import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { calculateAllPayroll } from '../services/payrollCalculator';
import { generateVoucher } from '../services/voucherGenerator';
import { generateBankExcel } from '../services/bankExcelGenerator';
import { notifyCalculateComplete, notifyBankExcel, notifyError } from '../services/telegramNotifier';

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

// GET /api/payroll/history - 월별 급여 처리 이력
router.get('/history', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM payrolls ORDER BY year_month DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('이력 조회 실패:', err);
    res.status(500).json({ error: '이력 조회 실패' });
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

// PUT /api/payroll/:id/confirm - 급여 확정
router.put('/:id/confirm', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payroll = await pool.query('SELECT * FROM payrolls WHERE id = $1', [id]);
    if (payroll.rows.length === 0) {
      res.status(404).json({ error: '급여 대장을 찾을 수 없습니다' });
      return;
    }
    if (payroll.rows[0].status !== 'draft') {
      res.status(400).json({ error: `draft 상태에서만 확정 가능합니다. 현재: ${payroll.rows[0].status}` });
      return;
    }

    await pool.query(
      `UPDATE payrolls SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await pool.query(
      `INSERT INTO payroll_logs (payroll_id, step, status, message) VALUES ($1, 'confirm', 'success', '급여 확정 완료')`,
      [id]
    );

    const updated = await pool.query('SELECT * FROM payrolls WHERE id = $1', [id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('급여 확정 실패:', err);
    res.status(500).json({ error: '급여 확정 실패' });
  }
});

// POST /api/payroll/:id/voucher - 전표 데이터 생성
router.post('/:id/voucher', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lines = await generateVoucher(parseInt(id as string, 10));

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

    res.json({
      lines,
      summary: {
        total_debit: totalDebit,
        total_credit: totalCredit,
        balanced: totalDebit === totalCredit,
      },
    });
  } catch (err) {
    console.error('전표 생성 실패:', err);
    res.status(500).json({ error: '전표 생성 실패', message: String(err) });
  }
});

// GET /api/payroll/:id/voucher - 전표 데이터 조회
router.get('/:id/voucher', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM payroll_vouchers WHERE payroll_id = $1 ORDER BY line_no',
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: '전표 데이터가 없습니다' });
      return;
    }

    const totalDebit = result.rows.reduce((s: number, r: any) => s + r.debit, 0);
    const totalCredit = result.rows.reduce((s: number, r: any) => s + r.credit, 0);

    res.json({
      lines: result.rows,
      summary: {
        total_debit: totalDebit,
        total_credit: totalCredit,
        balanced: totalDebit === totalCredit,
      },
    });
  } catch (err) {
    console.error('전표 조회 실패:', err);
    res.status(500).json({ error: '전표 조회 실패' });
  }
});

// GET /api/payroll/:id/bank-excel - 하나은행 엑셀 다운로드
router.get('/:id/bank-excel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { buffer, filename } = await generateBankExcel(parseInt(id as string, 10));

    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (err) {
    console.error('은행 엑셀 생성 실패:', err);
    res.status(500).json({ error: '은행 엑셀 생성 실패', message: String(err) });
  }
});

// POST /api/payroll/:id/notify - 텔레그램 알림 발송
router.post('/:id/notify', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type } = req.body;

    let success = false;
    const payrollId = parseInt(id as string, 10);

    switch (type) {
      case 'calculate':
        success = await notifyCalculateComplete(payrollId);
        break;
      case 'bank_excel':
        success = await notifyBankExcel(payrollId);
        break;
      case 'error':
        success = await notifyError(payrollId, req.body.message || '알 수 없는 오류');
        break;
      default:
        res.status(400).json({ error: `지원하지 않는 알림 유형: ${type}` });
        return;
    }

    if (success) {
      await pool.query(
        `INSERT INTO payroll_logs (payroll_id, step, status, message) VALUES ($1, 'notify', 'success', $2)`,
        [payrollId, `텔레그램 알림 전송 완료 (${type})`]
      );
    }

    res.json({ success, type });
  } catch (err) {
    console.error('알림 전송 실패:', err);
    res.status(500).json({ error: '알림 전송 실패', message: String(err) });
  }
});

// GET /api/payroll/:id/logs - 처리 로그 조회
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM payroll_logs WHERE payroll_id = $1 ORDER BY created_at DESC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('로그 조회 실패:', err);
    res.status(500).json({ error: '로그 조회 실패' });
  }
});

export default router;
