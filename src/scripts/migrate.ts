import pool from '../config/database';

async function migrate() {
  console.log('=== DB 마이그레이션 시작 ===');

  const queries = [
    // employees
    `CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      employee_code VARCHAR(10) NOT NULL,
      name VARCHAR(50) NOT NULL,
      position VARCHAR(20),
      department VARCHAR(50),
      is_ceo BOOLEAN DEFAULT false,
      base_salary INTEGER NOT NULL,
      meal_allowance INTEGER DEFAULT 0,
      car_allowance INTEGER DEFAULT 0,
      childcare_allowance INTEGER DEFAULT 0,
      dependents INTEGER DEFAULT 1,
      bank_name VARCHAR(20),
      bank_account VARCHAR(30),
      phone VARCHAR(15),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,

    // insurance_rates
    `CREATE TABLE IF NOT EXISTS insurance_rates (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL UNIQUE,
      national_pension DECIMAL(8,6) NOT NULL,
      health_insurance DECIMAL(8,6) NOT NULL,
      long_term_care DECIMAL(8,6) NOT NULL,
      employment_worker DECIMAL(8,6) NOT NULL,
      employment_employer DECIMAL(8,6) NOT NULL,
      employment_stability DECIMAL(8,6) NOT NULL,
      industrial_accident DECIMAL(8,6) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    // tax_brackets
    `CREATE TABLE IF NOT EXISTS tax_brackets (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      salary_from INTEGER NOT NULL,
      salary_to INTEGER NOT NULL,
      dep_1 INTEGER DEFAULT 0,
      dep_2 INTEGER DEFAULT 0,
      dep_3 INTEGER DEFAULT 0,
      dep_4 INTEGER DEFAULT 0,
      dep_5 INTEGER DEFAULT 0,
      dep_6 INTEGER DEFAULT 0,
      dep_7 INTEGER DEFAULT 0,
      dep_8 INTEGER DEFAULT 0,
      dep_9 INTEGER DEFAULT 0,
      dep_10 INTEGER DEFAULT 0,
      dep_11 INTEGER DEFAULT 0,
      UNIQUE(year, salary_from, salary_to)
    )`,

    // payrolls
    `CREATE TABLE IF NOT EXISTS payrolls (
      id SERIAL PRIMARY KEY,
      year_month VARCHAR(7) NOT NULL UNIQUE,
      payment_date DATE,
      status VARCHAR(20) DEFAULT 'draft',
      total_gross INTEGER DEFAULT 0,
      total_deductions INTEGER DEFAULT 0,
      total_net INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,

    // payroll_details
    `CREATE TABLE IF NOT EXISTS payroll_details (
      id SERIAL PRIMARY KEY,
      payroll_id INTEGER REFERENCES payrolls(id),
      employee_id INTEGER REFERENCES employees(id),
      base_salary INTEGER NOT NULL,
      meal_allowance INTEGER DEFAULT 0,
      car_allowance INTEGER DEFAULT 0,
      childcare_allowance INTEGER DEFAULT 0,
      gross_pay INTEGER NOT NULL,
      national_pension INTEGER DEFAULT 0,
      health_insurance INTEGER DEFAULT 0,
      long_term_care INTEGER DEFAULT 0,
      employment_insurance INTEGER DEFAULT 0,
      income_tax INTEGER DEFAULT 0,
      local_income_tax INTEGER DEFAULT 0,
      total_deductions INTEGER DEFAULT 0,
      net_pay INTEGER NOT NULL,
      UNIQUE(payroll_id, employee_id)
    )`,

    // payroll_vouchers
    `CREATE TABLE IF NOT EXISTS payroll_vouchers (
      id SERIAL PRIMARY KEY,
      payroll_id INTEGER REFERENCES payrolls(id),
      line_no INTEGER NOT NULL,
      division VARCHAR(10) NOT NULL,
      account_code VARCHAR(10) NOT NULL,
      account_name VARCHAR(30) NOT NULL,
      partner_code VARCHAR(10) NOT NULL,
      partner_name VARCHAR(30) NOT NULL,
      debit INTEGER DEFAULT 0,
      credit INTEGER DEFAULT 0,
      description VARCHAR(100),
      UNIQUE(payroll_id, line_no)
    )`,

    // payroll_logs
    `CREATE TABLE IF NOT EXISTS payroll_logs (
      id SERIAL PRIMARY KEY,
      payroll_id INTEGER REFERENCES payrolls(id),
      step VARCHAR(30) NOT NULL,
      status VARCHAR(10) NOT NULL,
      message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ];

  const tableNames = [
    'employees', 'insurance_rates', 'tax_brackets',
    'payrolls', 'payroll_details', 'payroll_vouchers', 'payroll_logs',
  ];

  for (let i = 0; i < queries.length; i++) {
    try {
      await pool.query(queries[i]);
      console.log(`✅ ${tableNames[i]} 테이블 생성 완료`);
    } catch (err) {
      console.error(`❌ ${tableNames[i]} 테이블 생성 실패:`, err);
      throw err;
    }
  }

  console.log('=== DB 마이그레이션 완료 ===');
  await pool.end();
}

migrate().catch(err => {
  console.error('마이그레이션 실패:', err);
  process.exit(1);
});
