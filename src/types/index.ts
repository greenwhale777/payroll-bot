export interface Employee {
  id: number;
  employee_code: string;
  name: string;
  position: string;
  department: string | null;
  is_ceo: boolean;
  base_salary: number;
  meal_allowance: number;
  car_allowance: number;
  childcare_allowance: number;
  dependents: number;
  bank_name: string | null;
  bank_account: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface InsuranceRates {
  id: number;
  year: number;
  national_pension: string;      // DECIMAL은 pg에서 string으로 반환
  health_insurance: string;
  long_term_care: string;
  employment_worker: string;
  employment_employer: string;
  employment_stability: string;
  industrial_accident: string;
}

export interface TaxBracket {
  id: number;
  year: number;
  salary_from: number;
  salary_to: number;
  dep_1: number;
  dep_2: number;
  dep_3: number;
  dep_4: number;
  dep_5: number;
  dep_6: number;
  dep_7: number;
  dep_8: number;
  dep_9: number;
  dep_10: number;
  dep_11: number;
}

export interface Payroll {
  id: number;
  year_month: string;
  payment_date: string | null;
  status: 'draft' | 'confirmed' | 'voucher_created' | 'completed';
  total_gross: number;
  total_deductions: number;
  total_net: number;
  created_at: Date;
  updated_at: Date;
}

export interface PayrollDetail {
  id: number;
  payroll_id: number;
  employee_id: number;
  base_salary: number;
  meal_allowance: number;
  car_allowance: number;
  childcare_allowance: number;
  gross_pay: number;
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  income_tax: number;
  local_income_tax: number;
  total_deductions: number;
  net_pay: number;
}

export interface PayrollVoucher {
  id: number;
  payroll_id: number;
  line_no: number;
  division: string;
  account_code: string;
  account_name: string;
  partner_code: string;
  partner_name: string;
  debit: number;
  credit: number;
  description: string | null;
}

export interface PayrollLog {
  id: number;
  payroll_id: number;
  step: string;
  status: 'success' | 'error';
  message: string | null;
  created_at: Date;
}

export interface PayrollCalculationResult {
  employee: Employee;
  base_salary: number;
  meal_allowance: number;
  car_allowance: number;
  childcare_allowance: number;
  gross_pay: number;
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  income_tax: number;
  local_income_tax: number;
  total_deductions: number;
  net_pay: number;
}
