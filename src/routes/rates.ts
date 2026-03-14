import { Router, Request, Response } from 'express';
import pool from '../config/database';

const router = Router();

// GET /api/rates/:year - 요율 조회
router.get('/:year', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM insurance_rates WHERE year = $1', [req.params.year]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: '해당 연도 요율을 찾을 수 없습니다' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('요율 조회 실패:', err);
    res.status(500).json({ error: '요율 조회 실패' });
  }
});

// PUT /api/rates/:year - 요율 수정
router.put('/:year', async (req: Request, res: Response) => {
  try {
    const { national_pension, health_insurance, long_term_care, employment_worker, employment_employer, employment_stability, industrial_accident } = req.body;
    const result = await pool.query(
      `UPDATE insurance_rates SET
        national_pension = COALESCE($1, national_pension),
        health_insurance = COALESCE($2, health_insurance),
        long_term_care = COALESCE($3, long_term_care),
        employment_worker = COALESCE($4, employment_worker),
        employment_employer = COALESCE($5, employment_employer),
        employment_stability = COALESCE($6, employment_stability),
        industrial_accident = COALESCE($7, industrial_accident)
      WHERE year = $8 RETURNING *`,
      [national_pension, health_insurance, long_term_care, employment_worker, employment_employer, employment_stability, industrial_accident, req.params.year]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: '해당 연도 요율을 찾을 수 없습니다' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('요율 수정 실패:', err);
    res.status(500).json({ error: '요율 수정 실패' });
  }
});

export default router;
