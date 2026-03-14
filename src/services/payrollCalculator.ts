import Decimal from 'decimal.js';
import pool from '../config/database';
import { Employee, InsuranceRates, PayrollCalculationResult } from '../types';
import { lookupIncomeTax } from './taxLookup';

/**
 * 10원 미만 절사 (원 미만 절사 → 10원 미만 절사)
 */
function roundDown10(value: Decimal): number {
  const truncatedWon = value.floor();           // 원 미만 절사
  const truncated10 = truncatedWon.div(10).floor().mul(10); // 10원 절사
  return truncated10.toNumber();
}

/**
 * 보험료 계산: Decimal 정밀 연산 → 10원 절사
 */
function calcInsurance(taxableAmount: number, rate: string): number {
  const result = new Decimal(taxableAmount).mul(rate);
  return roundDown10(result);
}

/**
 * 전 직원 급여 계산
 */
export async function calculateAllPayroll(year: number = 2026): Promise<PayrollCalculationResult[]> {
  // 활성 직원 조회
  const empResult = await pool.query<Employee>(
    'SELECT * FROM employees WHERE is_active = true ORDER BY employee_code'
  );
  const employees = empResult.rows;

  // 보험 요율 조회
  const rateResult = await pool.query<InsuranceRates>(
    'SELECT * FROM insurance_rates WHERE year = $1',
    [year]
  );
  if (rateResult.rows.length === 0) {
    throw new Error(`${year}년 보험 요율이 없습니다.`);
  }
  const rates = rateResult.rows[0];

  const results: PayrollCalculationResult[] = [];

  for (const emp of employees) {
    const detail = await calculateOneEmployee(emp, rates);
    results.push(detail);
  }

  return results;
}

/**
 * 직원 1명 급여 계산
 */
export async function calculateOneEmployee(
  emp: Employee,
  rates: InsuranceRates
): Promise<PayrollCalculationResult> {
  const baseSalary = emp.base_salary;
  const mealAllowance = emp.meal_allowance;
  const carAllowance = emp.car_allowance;
  const childcareAllowance = emp.childcare_allowance;

  // 1. 과세급여 = 기본급만
  const taxableSalary = baseSalary;

  // 2. 비과세합계
  const nonTaxable = mealAllowance + carAllowance + childcareAllowance;

  // 3. 지급총액
  const grossPay = taxableSalary + nonTaxable;

  // 4. 국민연금 = roundDown10(과세급여 × 0.0475)
  const nationalPension = calcInsurance(taxableSalary, rates.national_pension);

  // 5. 건강보험 = roundDown10(과세급여 × 0.03595)
  const healthInsurance = calcInsurance(taxableSalary, rates.health_insurance);

  // 6. 장기요양 = roundDown10(건강보험(절사후) × 0.1314)
  const longTermCare = calcInsurance(healthInsurance, rates.long_term_care);

  // 7. 고용보험: 대표이사 제외
  const employmentInsurance = emp.is_ceo ? 0 : calcInsurance(taxableSalary, rates.employment_worker);

  // 8. 소득세: 간이세액표 조회
  const incomeTax = await lookupIncomeTax(taxableSalary, emp.dependents);

  // 9. 지방소득세 = floor(소득세 × 0.1 / 10) × 10
  const localIncomeTax = Math.floor(incomeTax * 0.1 / 10) * 10;

  // 10. 공제합계
  const totalDeductions = nationalPension + healthInsurance + longTermCare +
    employmentInsurance + incomeTax + localIncomeTax;

  // 11. 실수령액
  const netPay = grossPay - totalDeductions;

  return {
    employee: emp,
    base_salary: baseSalary,
    meal_allowance: mealAllowance,
    car_allowance: carAllowance,
    childcare_allowance: childcareAllowance,
    gross_pay: grossPay,
    national_pension: nationalPension,
    health_insurance: healthInsurance,
    long_term_care: longTermCare,
    employment_insurance: employmentInsurance,
    income_tax: incomeTax,
    local_income_tax: localIncomeTax,
    total_deductions: totalDeductions,
    net_pay: netPay,
  };
}
