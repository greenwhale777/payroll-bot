import pool from '../config/database';

async function seed() {
  console.log('=== 초기 데이터 삽입 시작 ===');

  // employees
  const employees = [
    { code: '00001', name: '전상우', position: '사장', is_ceo: true, base_salary: 400000, meal: 0, car: 0, childcare: 0, dependents: 1, bank: '농협은행', account: '3019337958141', phone: '01093379581' },
    { code: '00004', name: '박정우', position: '팀장', is_ceo: false, base_salary: 5066670, meal: 200000, car: 200000, childcare: 200000, dependents: 2, bank: '우리은행', account: '1002061760423', phone: '01095004383' },
    { code: '00003', name: '임서화', position: '팀장', is_ceo: false, base_salary: 2290000, meal: 200000, car: 200000, childcare: 0, dependents: 1, bank: '우리은행', account: '1002454113405', phone: '01025447129' },
    { code: '00002', name: '채우리', position: '팀장', is_ceo: false, base_salary: 1800000, meal: 200000, car: 200000, childcare: 0, dependents: 3, bank: '기업은행', account: '61302711601013', phone: '01050560630' },
  ];

  for (const emp of employees) {
    const existing = await pool.query('SELECT id FROM employees WHERE employee_code = $1', [emp.code]);
    if (existing.rows.length > 0) {
      console.log(`⏭️  직원 ${emp.name} (${emp.code}) 이미 존재, 건너뜀`);
      continue;
    }
    await pool.query(
      `INSERT INTO employees (employee_code, name, position, is_ceo, base_salary, meal_allowance, car_allowance, childcare_allowance, dependents, bank_name, bank_account, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [emp.code, emp.name, emp.position, emp.is_ceo, emp.base_salary, emp.meal, emp.car, emp.childcare, emp.dependents, emp.bank, emp.account, emp.phone]
    );
    console.log(`✅ 직원 ${emp.name} (${emp.code}) 삽입 완료`);
  }

  // insurance_rates 2026
  const ratesExisting = await pool.query('SELECT id FROM insurance_rates WHERE year = $1', [2026]);
  if (ratesExisting.rows.length > 0) {
    console.log('⏭️  2026년 보험 요율 이미 존재, 건너뜀');
  } else {
    await pool.query(
      `INSERT INTO insurance_rates (year, national_pension, health_insurance, long_term_care, employment_worker, employment_employer, employment_stability, industrial_accident)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [2026, 0.0475, 0.03595, 0.1314, 0.009, 0.009, 0.0025, 0.0095]
    );
    console.log('✅ 2026년 보험 요율 삽입 완료');
  }

  console.log('=== 초기 데이터 삽입 완료 ===');
  await pool.end();
}

seed().catch(err => {
  console.error('시드 실패:', err);
  process.exit(1);
});
