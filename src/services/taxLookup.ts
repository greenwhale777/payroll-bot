import pool from '../config/database';
import { TaxBracket } from '../types';

/**
 * 간이세액표 조회
 * @param taxableSalary 과세급여 (원)
 * @param dependents 가족수 (1~11)
 * @param year 연도
 * @returns 소득세 (원)
 */
export async function lookupIncomeTax(
  taxableSalary: number,
  dependents: number,
  year: number = 2026
): Promise<number> {
  // 과세급여를 천원 단위로 환산
  const salaryInThousand = Math.floor(taxableSalary / 1000);

  // 770천원 미만 → 세액 0원
  if (salaryInThousand < 770) {
    return 0;
  }

  // 가족수 범위 제한 (1~11)
  const dep = Math.min(Math.max(dependents, 1), 11);
  const depColumn = `dep_${dep}`;

  const result = await pool.query<TaxBracket>(
    `SELECT * FROM tax_brackets
     WHERE year = $1 AND salary_from <= $2 AND salary_to > $2
     ORDER BY salary_from DESC LIMIT 1`,
    [year, salaryInThousand]
  );

  if (result.rows.length === 0) {
    // 구간을 찾지 못한 경우 (10,000천원 초과 등)
    console.warn(`⚠️ 간이세액표 구간 미발견: ${salaryInThousand}천원, 가족수 ${dep}`);
    return 0;
  }

  const bracket = result.rows[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tax = (bracket as any)[depColumn] as number;
  return tax || 0;
}
