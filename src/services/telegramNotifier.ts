import pool from '../config/database';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '35391597';

/**
 * HTML 특수문자 이스케이프
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 숫자를 천 단위 콤마 포맷
 */
function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

/**
 * 텔레그램 메시지 전송 (HTML → plain text 폴백)
 */
async function sendMessage(text: string, parseMode: 'HTML' | '' = 'HTML'): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.');
    return false;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const body: any = { chat_id: CHAT_ID, text };
    if (parseMode) body.parse_mode = parseMode;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json() as { ok: boolean };
    if (!result.ok) {
      // HTML 실패 시 plain text 폴백
      if (parseMode === 'HTML') {
        console.warn('HTML 전송 실패, plain text로 재시도');
        const plainText = text.replace(/<[^>]*>/g, '');
        return sendMessage(plainText, '');
      }
      console.error('텔레그램 전송 실패:', result);
      return false;
    }
    return true;
  } catch (err) {
    console.error('텔레그램 전송 에러:', err);
    if (parseMode === 'HTML') {
      const plainText = text.replace(/<[^>]*>/g, '');
      return sendMessage(plainText, '');
    }
    return false;
  }
}

/**
 * 급여 계산 완료 알림
 */
export async function notifyCalculateComplete(payrollId: number): Promise<boolean> {
  const payroll = await pool.query('SELECT * FROM payrolls WHERE id = $1', [payrollId]);
  if (payroll.rows.length === 0) return false;
  const p = payroll.rows[0];

  const details = await pool.query(
    `SELECT pd.net_pay, e.name
     FROM payroll_details pd
     JOIN employees e ON pd.employee_id = e.id
     WHERE pd.payroll_id = $1
     ORDER BY e.employee_code`,
    [payrollId]
  );

  const [yearStr, monthStr] = p.year_month.split('-');
  const lines = [
    `💰 <b>${yearStr}년 ${parseInt(monthStr, 10)}월 급여 계산 완료</b>`,
    '',
    `총 지급액: ${formatNumber(p.total_gross)}원`,
    `총 공제액: ${formatNumber(p.total_deductions)}원`,
    `총 실수령액: ${formatNumber(p.total_net)}원`,
    '',
  ];

  for (const d of details.rows) {
    lines.push(`• ${escapeHtml(d.name)}: ${formatNumber(d.net_pay)}원`);
  }

  return sendMessage(lines.join('\n'));
}

/**
 * 은행 이체 엑셀 생성 알림
 */
export async function notifyBankExcel(payrollId: number): Promise<boolean> {
  const payroll = await pool.query('SELECT * FROM payrolls WHERE id = $1', [payrollId]);
  if (payroll.rows.length === 0) return false;
  const p = payroll.rows[0];

  const details = await pool.query(
    `SELECT pd.net_pay, e.name, e.bank_name
     FROM payroll_details pd
     JOIN employees e ON pd.employee_id = e.id
     WHERE pd.payroll_id = $1 AND e.is_active = true AND pd.net_pay > 0
     ORDER BY e.employee_code`,
    [payrollId]
  );

  const [yearStr, monthStr] = p.year_month.split('-');
  const totalTransfer = details.rows.reduce((s: number, d: any) => s + d.net_pay, 0);
  const lines = [
    `🏦 <b>${yearStr}년 ${parseInt(monthStr, 10)}월 급여 이체 정보</b>`,
    '',
    `이체 대상: ${details.rows.length}명`,
    `이체 합계: ${formatNumber(totalTransfer)}원`,
    '',
  ];

  for (const d of details.rows) {
    lines.push(`• ${escapeHtml(d.name)} (${escapeHtml(d.bank_name)}): ${formatNumber(d.net_pay)}원`);
  }

  return sendMessage(lines.join('\n'));
}

/**
 * 오류 알림
 */
export async function notifyError(payrollId: number, errorMessage: string): Promise<boolean> {
  const payroll = await pool.query('SELECT * FROM payrolls WHERE id = $1', [payrollId]);
  const yearMonth = payroll.rows.length > 0 ? payroll.rows[0].year_month : '알 수 없음';

  const text = [
    `❌ <b>급여 처리 오류</b>`,
    '',
    `월: ${escapeHtml(yearMonth)}`,
    `오류: ${escapeHtml(errorMessage)}`,
  ].join('\n');

  return sendMessage(text);
}
