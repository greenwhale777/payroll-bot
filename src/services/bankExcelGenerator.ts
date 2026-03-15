import * as XLSX from 'xlsx';
import pool from '../config/database';

interface BankTransferRow {
  bank_name: string;
  bank_account: string;
  net_pay: number;
  name: string;
  phone: string;
}

/**
 * 하나은행 대량이체 엑셀 (.xls) 생성
 */
export async function generateBankExcel(payrollId: number): Promise<{ buffer: Buffer; filename: string }> {
  // payroll 조회
  const payrollResult = await pool.query('SELECT * FROM payrolls WHERE id = $1', [payrollId]);
  if (payrollResult.rows.length === 0) {
    throw new Error('급여 대장을 찾을 수 없습니다.');
  }
  const payroll = payrollResult.rows[0];

  // 직원별 상세 + 은행 정보 조회
  const detailsResult = await pool.query<BankTransferRow>(
    `SELECT e.bank_name, e.bank_account, pd.net_pay, e.name, e.phone
     FROM payroll_details pd
     JOIN employees e ON pd.employee_id = e.id
     WHERE pd.payroll_id = $1 AND e.is_active = true AND pd.net_pay > 0
     ORDER BY e.employee_code`,
    [payrollId]
  );
  const rows = detailsResult.rows;

  const [yearStr, monthStr] = payroll.year_month.split('-');
  const yy = yearStr.slice(2);
  const mm = parseInt(monthStr, 10);

  // Sheet1: 데이터
  const sheet1Data: any[][] = [
    ['입금은행', '입금계좌번호', '입금액', '예상예금주', '입금통장표시', '출금통장표시', '메모', 'CMS코드', '받는분 휴대폰번호'],
  ];

  for (const row of rows) {
    sheet1Data.push([
      row.bank_name,
      row.bank_account,
      row.net_pay,
      row.name,
      '급여-어센더즈',
      `${yy}년 ${mm}월 급여`,
      '',
      '',
      row.phone || '',
    ]);
  }

  // 마지막 행 다음에 빈 행 + I열에 \\
  const emptyRow = ['', '', '', '', '', '', '', '', '\\\\'];
  sheet1Data.push(emptyRow);

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

  // Sheet2: 양식 설명
  const sheet2Data = [
    ['[필수] 1. 입금은행에는 은행코드 및 은행명을 입력합니다.'],
    ['[필수] 2. 입금계좌번호에는 구분자(-)를 제외한 숫자만 입력합니다.'],
    ['[필수] 3. 입금액에는 이체할 금액을 입력합니다.'],
    ['[선택] 4. 예상예금주는 입금계좌의 예금주를 입력합니다.'],
    ['[선택] 5. 입금통장표시내용은 필요한 경우만 입력합니다.'],
    ['[선택] 6. 출금통장표시내용은 필요한 경우만 입력합니다.'],
    ['[선택] 7. 메모는 필요한 경우만 입력합니다.'],
    ['[선택] 8. CMS코드는 필요한 경우만 입력합니다.'],
    ['[선택] 9. 송금 받는 분에게 이체내용을 SMS로 통지를 원하는 경우 미리 입력 할 수 있습니다.'],
    ['* Excel Sheet의 구조는 절대로 변경하지 마십시오.'],
    ['* 입금은행, 입금계좌번호, 입금액은 필수입력사항입니다.'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);

  // 워크북 생성
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
  XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');

  // .xls 형식으로 버퍼 생성
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xls' });

  // 파일명: HNB_대량이체_KO_YYMMDD_어센더즈_MM월급여.xls
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const nowMM = String(now.getMonth() + 1).padStart(2, '0');
  const nowYY = String(now.getFullYear()).slice(2);
  const filename = `HNB_대량이체_KO_${nowYY}${nowMM}${dd}_어센더즈_${mm}월급여.xls`;

  // 로그 기록
  await pool.query(
    `INSERT INTO payroll_logs (payroll_id, step, status, message) VALUES ($1, 'bank_excel', 'success', $2)`,
    [payrollId, `하나은행 엑셀 생성: ${rows.length}명, 합계 ${rows.reduce((s, r) => s + r.net_pay, 0).toLocaleString()}원`]
  );

  return { buffer: buf, filename };
}
