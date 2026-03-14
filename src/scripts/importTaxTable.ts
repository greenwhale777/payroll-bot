import * as XLSX from 'xlsx';
import * as path from 'path';
import pool from '../config/database';

async function importTaxTable() {
  console.log('=== 간이세액표 DB 적재 시작 ===');

  const filePath = path.join(__dirname, '../../data/근로소득 간이세액표.xlsx');
  const workbook = XLSX.readFile(filePath);

  // '근로소득간이세액표' 시트 찾기
  const sheetName = workbook.SheetNames.find(n => n.includes('간이세액표'));
  if (!sheetName) {
    console.error('❌ 간이세액표 시트를 찾을 수 없습니다. 시트 목록:', workbook.SheetNames);
    process.exit(1);
  }
  console.log(`📄 시트: ${sheetName}`);

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null });

  // Row 5~651이 실제 데이터 (인덱스 4~650)
  let insertCount = 0;
  let skipCount = 0;

  for (let i = 4; i < data.length; i++) {
    const row = data[i] as (string | number | null)[];
    if (!row || row.length < 3) continue;

    const salaryFrom = parseNumber(row[0]);
    const salaryTo = parseNumber(row[1]);

    // 숫자가 아닌 행은 건너뛰기
    if (salaryFrom === null || salaryTo === null) {
      skipCount++;
      continue;
    }

    // 10,000천원 초과 구간 스킵 (별도 처리 필요)
    if (salaryFrom >= 10000) {
      skipCount++;
      continue;
    }

    const deps: number[] = [];
    for (let j = 2; j <= 12; j++) {
      deps.push(parseTaxValue(row[j]));
    }

    try {
      await pool.query(
        `INSERT INTO tax_brackets (year, salary_from, salary_to, dep_1, dep_2, dep_3, dep_4, dep_5, dep_6, dep_7, dep_8, dep_9, dep_10, dep_11)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (year, salary_from, salary_to) DO NOTHING`,
        [2026, salaryFrom, salaryTo, ...deps]
      );
      insertCount++;
    } catch (err) {
      console.error(`❌ 행 ${i + 1} 삽입 실패:`, err);
    }
  }

  console.log(`✅ ${insertCount}행 삽입, ${skipCount}행 스킵`);

  // 검증: 총 행 수 확인
  const result = await pool.query('SELECT COUNT(*) FROM tax_brackets WHERE year = 2026');
  console.log(`📊 tax_brackets 테이블 총 행 수: ${result.rows[0].count}`);

  console.log('=== 간이세액표 DB 적재 완료 ===');
  await pool.end();
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/,/g, '').trim();
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

function parseTaxValue(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (value === '-' || value === ' -' || value === '- ') return 0;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/,/g, '').trim();
  if (str === '-' || str === '') return 0;
  const n = parseInt(str, 10);
  return isNaN(n) ? 0 : n;
}

importTaxTable().catch(err => {
  console.error('간이세액표 적재 실패:', err);
  process.exit(1);
});
