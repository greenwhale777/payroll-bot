import Decimal from 'decimal.js';
import pool from '../config/database';
import { InsuranceRates, PayrollVoucher } from '../types';

/**
 * 10원 미만 절사
 */
function roundDown10(value: Decimal): number {
  const truncatedWon = value.floor();
  return truncatedWon.div(10).floor().mul(10).toNumber();
}

/**
 * 보험료 계산 (사업자 부담용)
 */
function calcInsurance(taxableAmount: number, rate: string): number {
  const result = new Decimal(taxableAmount).mul(rate);
  return roundDown10(result);
}

interface VoucherLine {
  line_no: number;
  division: string;
  account_code: string;
  account_name: string;
  partner_code: string;
  partner_name: string;
  debit: number;
  credit: number;
  description: string;
}

/**
 * 급여 전표 12행 생성
 */
export async function generateVoucher(payrollId: number): Promise<VoucherLine[]> {
  // payroll 조회
  const payrollResult = await pool.query('SELECT * FROM payrolls WHERE id = $1', [payrollId]);
  if (payrollResult.rows.length === 0) {
    throw new Error('급여 대장을 찾을 수 없습니다.');
  }
  const payroll = payrollResult.rows[0];

  if (payroll.status !== 'confirmed') {
    throw new Error(`전표 생성은 confirmed 상태에서만 가능합니다. 현재: ${payroll.status}`);
  }

  // 직원별 상세 조회 (직원 정보 포함)
  const detailsResult = await pool.query(
    `SELECT pd.*, e.is_ceo, e.base_salary as emp_base_salary
     FROM payroll_details pd
     JOIN employees e ON pd.employee_id = e.id
     WHERE pd.payroll_id = $1`,
    [payrollId]
  );
  const details = detailsResult.rows;

  // 보험 요율 조회
  const year = parseInt(payroll.year_month.split('-')[0], 10);
  const rateResult = await pool.query<InsuranceRates>(
    'SELECT * FROM insurance_rates WHERE year = $1', [year]
  );
  if (rateResult.rows.length === 0) {
    throw new Error(`${year}년 보험 요율이 없습니다.`);
  }
  const rates = rateResult.rows[0];

  // === 근로자 부담 합계 ===
  const sumGrossPay = details.reduce((s: number, d: any) => s + d.gross_pay, 0);
  const sumIncomeTax = details.reduce((s: number, d: any) => s + d.income_tax, 0);
  const sumLocalIncomeTax = details.reduce((s: number, d: any) => s + d.local_income_tax, 0);
  const sumNationalPension = details.reduce((s: number, d: any) => s + d.national_pension, 0);
  const sumHealthWorker = details.reduce((s: number, d: any) => s + d.health_insurance, 0);
  const sumLongTermWorker = details.reduce((s: number, d: any) => s + d.long_term_care, 0);
  const sumEmploymentWorker = details.reduce((s: number, d: any) => s + d.employment_insurance, 0);
  const sumNetPay = details.reduce((s: number, d: any) => s + d.net_pay, 0);

  // === 사업자 부담 (직원별 개별 계산 후 합산) ===
  let sumNationalPensionEmployer = 0;
  let sumHealthEmployer = 0;
  let sumLongTermEmployer = 0;
  let sumEmploymentEmployer = 0;
  let sumIndustrialAccident = 0;

  for (const d of details) {
    const taxable = d.base_salary;

    // 국민연금(사업자) - 전원
    sumNationalPensionEmployer += calcInsurance(taxable, rates.national_pension);

    // 건강보험(사업자) - 전원
    const healthEmp = calcInsurance(taxable, rates.health_insurance);
    sumHealthEmployer += healthEmp;

    // 장기요양(사업자) - 건강보험(사업자) 기준
    sumLongTermEmployer += calcInsurance(healthEmp, rates.long_term_care);

    if (!d.is_ceo) {
      // 고용보험(사업자) = 0.9% + 0.25% = 1.15% — 대표이사 제외
      const empRate = new Decimal(rates.employment_employer).plus(rates.employment_stability).toString();
      sumEmploymentEmployer += calcInsurance(taxable, empRate);

      // 산재보험(사업자) — 대표이사 제외
      sumIndustrialAccident += calcInsurance(taxable, rates.industrial_accident);
    }
  }

  // 적요
  const [yearStr, monthStr] = payroll.year_month.split('-');
  const description = `${yearStr}년 ${parseInt(monthStr, 10)}월 급여대장`;

  // 행8 차변 = 건강(사업자) + 장기요양(사업자)
  const line8Debit = sumHealthEmployer + sumLongTermEmployer;

  // 행11 대변 = 사업자부담 4대보험 합계
  const line11Credit = sumNationalPensionEmployer + line8Debit + sumEmploymentEmployer + sumIndustrialAccident;

  const lines: VoucherLine[] = [
    { line_no: 1, division: '3차', account_code: '8029', account_name: '직원급여(판)', partner_code: '11132', partner_name: '어센더즈 임직원', debit: sumGrossPay, credit: 0, description },
    { line_no: 2, division: '4대', account_code: '2549', account_name: '예수금', partner_code: '00001', partner_name: '세무서', debit: 0, credit: sumIncomeTax, description: '' },
    { line_no: 3, division: '4대', account_code: '2549', account_name: '예수금', partner_code: '11112', partner_name: '서울시', debit: 0, credit: sumLocalIncomeTax, description: '' },
    { line_no: 4, division: '4대', account_code: '2549', account_name: '예수금', partner_code: '11128', partner_name: '국민연금', debit: 0, credit: sumNationalPension, description: '' },
    { line_no: 5, division: '4대', account_code: '2549', account_name: '예수금', partner_code: '11129', partner_name: '건강보험', debit: 0, credit: sumHealthWorker + sumLongTermWorker, description: '' },
    { line_no: 6, division: '4대', account_code: '2549', account_name: '예수금', partner_code: '11130', partner_name: '고용보험', debit: 0, credit: sumEmploymentWorker, description: '' },
    { line_no: 7, division: '3차', account_code: '8109', account_name: '복리후생비(판)', partner_code: '11128', partner_name: '국민연금', debit: sumNationalPensionEmployer, credit: 0, description },
    { line_no: 8, division: '3차', account_code: '8269', account_name: '보험료(판)', partner_code: '11129', partner_name: '건강보험', debit: line8Debit, credit: 0, description },
    { line_no: 9, division: '3차', account_code: '8269', account_name: '보험료(판)', partner_code: '11130', partner_name: '고용보험', debit: sumEmploymentEmployer, credit: 0, description },
    { line_no: 10, division: '4대', account_code: '2539', account_name: '미지급금', partner_code: '11132', partner_name: '어센더즈 임직원', debit: 0, credit: sumNetPay, description: '' },
    { line_no: 11, division: '4대', account_code: '2539', account_name: '미지급금', partner_code: '11137', partner_name: '4대보험', debit: 0, credit: line11Credit, description: '' },
    { line_no: 12, division: '3차', account_code: '8269', account_name: '보험료(판)', partner_code: '11131', partner_name: '산재보험', debit: sumIndustrialAccident, credit: 0, description },
  ];

  // 대차 검증
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (totalDebit !== totalCredit) {
    throw new Error(`대차 불일치: 차변 ${totalDebit.toLocaleString()} ≠ 대변 ${totalCredit.toLocaleString()}`);
  }

  // DB 저장 (기존 데이터 삭제 후 삽입)
  await pool.query('DELETE FROM payroll_vouchers WHERE payroll_id = $1', [payrollId]);

  for (const line of lines) {
    await pool.query(
      `INSERT INTO payroll_vouchers (payroll_id, line_no, division, account_code, account_name, partner_code, partner_name, debit, credit, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [payrollId, line.line_no, line.division, line.account_code, line.account_name, line.partner_code, line.partner_name, line.debit, line.credit, line.description]
    );
  }

  // status 업데이트
  await pool.query(
    `UPDATE payrolls SET status = 'voucher_created', updated_at = NOW() WHERE id = $1`,
    [payrollId]
  );

  // 로그
  await pool.query(
    `INSERT INTO payroll_logs (payroll_id, step, status, message) VALUES ($1, 'voucher', 'success', $2)`,
    [payrollId, `전표 12행 생성 완료. 차변=${totalDebit.toLocaleString()}, 대변=${totalCredit.toLocaleString()}`]
  );

  return lines;
}
