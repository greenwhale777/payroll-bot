import { Router, Request, Response } from 'express';
import pool from '../config/database';

const router = Router();

// GET /api/employees - 전체 직원 목록
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM employees WHERE is_active = true ORDER BY employee_code'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('직원 목록 조회 실패:', err);
    res.status(500).json({ error: '직원 목록 조회 실패' });
  }
});

// GET /api/employees/:id - 직원 상세
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: '직원을 찾을 수 없습니다' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('직원 조회 실패:', err);
    res.status(500).json({ error: '직원 조회 실패' });
  }
});

// PUT /api/employees/:id - 직원 정보 수정
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, position, department, is_ceo, base_salary, meal_allowance, car_allowance, childcare_allowance, dependents, bank_name, bank_account, phone } = req.body;
    const result = await pool.query(
      `UPDATE employees SET
        name = COALESCE($1, name),
        position = COALESCE($2, position),
        department = COALESCE($3, department),
        is_ceo = COALESCE($4, is_ceo),
        base_salary = COALESCE($5, base_salary),
        meal_allowance = COALESCE($6, meal_allowance),
        car_allowance = COALESCE($7, car_allowance),
        childcare_allowance = COALESCE($8, childcare_allowance),
        dependents = COALESCE($9, dependents),
        bank_name = COALESCE($10, bank_name),
        bank_account = COALESCE($11, bank_account),
        phone = COALESCE($12, phone),
        updated_at = NOW()
      WHERE id = $13 RETURNING *`,
      [name, position, department, is_ceo, base_salary, meal_allowance, car_allowance, childcare_allowance, dependents, bank_name, bank_account, phone, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: '직원을 찾을 수 없습니다' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('직원 수정 실패:', err);
    res.status(500).json({ error: '직원 수정 실패' });
  }
});

// POST /api/employees - 직원 추가
router.post('/', async (req: Request, res: Response) => {
  try {
    const { employee_code, name, position, department, is_ceo, base_salary, meal_allowance, car_allowance, childcare_allowance, dependents, bank_name, bank_account, phone } = req.body;
    const result = await pool.query(
      `INSERT INTO employees (employee_code, name, position, department, is_ceo, base_salary, meal_allowance, car_allowance, childcare_allowance, dependents, bank_name, bank_account, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [employee_code, name, position, department || null, is_ceo || false, base_salary, meal_allowance || 0, car_allowance || 0, childcare_allowance || 0, dependents || 1, bank_name, bank_account, phone]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('직원 추가 실패:', err);
    res.status(500).json({ error: '직원 추가 실패' });
  }
});

export default router;
