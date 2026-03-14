import { calculateAllPayroll } from '../services/payrollCalculator';
import pool from '../config/database';

interface Expected {
  name: string;
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  income_tax: number;
  local_income_tax: number;
  net_pay: number;
}

const EXPECTED: Expected[] = [
  { name: '전상우', national_pension: 19000, health_insurance: 14380, long_term_care: 1880, employment_insurance: 0, income_tax: 0, local_income_tax: 0, net_pay: 364740 },
  { name: '박정우', national_pension: 240660, health_insurance: 182140, long_term_care: 23930, employment_insurance: 45600, income_tax: 315080, local_income_tax: 31500, net_pay: 4827760 },
  { name: '임서화', national_pension: 108770, health_insurance: 82320, long_term_care: 10810, employment_insurance: 20610, income_tax: 28840, local_income_tax: 2880, net_pay: 2435770 },
  { name: '채우리', national_pension: 85500, health_insurance: 64710, long_term_care: 8500, employment_insurance: 16200, income_tax: 2630, local_income_tax: 260, net_pay: 2022200 },
];

async function verify() {
  console.log('=== 2월 급여 계산 검증 시작 ===\n');

  const results = await calculateAllPayroll(2026);

  let allPass = true;
  const fields: (keyof Expected)[] = ['national_pension', 'health_insurance', 'long_term_care', 'employment_insurance', 'income_tax', 'local_income_tax', 'net_pay'];
  const fieldLabels: Record<string, string> = {
    national_pension: '국민연금',
    health_insurance: '건강보험',
    long_term_care: '장기요양',
    employment_insurance: '고용보험',
    income_tax: '소득세',
    local_income_tax: '지방소득세',
    net_pay: '실수령액',
  };

  for (const expected of EXPECTED) {
    const actual = results.find(r => r.employee.name === expected.name);
    if (!actual) {
      console.log(`❌ ${expected.name}: 계산 결과 없음`);
      allPass = false;
      continue;
    }

    let employeePass = true;
    const details: string[] = [];

    for (const field of fields) {
      const exp = expected[field];
      const act = actual[field as keyof typeof actual] as number;
      const match = exp === act;
      if (!match) employeePass = false;
      details.push(`${fieldLabels[field]}: ${act.toLocaleString()} ${match ? '✅' : `❌ (기대: ${exp.toLocaleString()})`}`);
    }

    console.log(`${employeePass ? '✅' : '❌'} ${expected.name}`);
    details.forEach(d => console.log(`   ${d}`));
    console.log();

    if (!employeePass) allPass = false;
  }

  if (allPass) {
    console.log('🎉 전 항목 100% 일치! 검증 통과!');
  } else {
    console.log('⚠️  일부 항목 불일치! 계산 로직 수정 필요.');
    process.exitCode = 1;
  }

  await pool.end();
}

verify().catch(err => {
  console.error('검증 실패:', err);
  process.exit(1);
});
