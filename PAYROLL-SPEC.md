# 급여 봇 기술 명세 (PAYROLL-SPEC)

## 1. 자동화 범위

| 단계 | 업무 | 자동화 수준 |
|------|------|------------|
| 1 | 급여 대장 계산 | 완전 자동화 — DB 직원 마스터 기반 자동 계산 |
| 2 | 이카운트 비교 | 반자동화 — Playwright 스크래핑 후 diff 비교 |
| 3 | 급여 전표 생성 | 완전 자동화 — 이카운트 FastEntry 업로드 |
| 5 | 은행 이체 엑셀 | 완전 자동화 — 하나은행 양식 .xls 생성 + 텔레그램 알림 |
| 8 | 반제 회계처리 | 완전 자동화 — 미지급금/예수금 반제 전표 생성 |

제외: 4단계(4대보험 자동이체), 6단계(홈택스), 7단계(위택스)

---

## 2. 직원 마스터 데이터 (2026년 3월 기준)

### 급여 구조

| 사번 | 성명 | 직위 | 급여(과세) | 식대 | 차량유지비 | 보육수당 | 지급총액 | 가족수 |
|------|------|------|-----------|------|----------|---------|---------|--------|
| 00001 | 전상우 | 사장 | 400,000 | - | - | - | 400,000 | 1 |
| 00004 | 박정우 | 팀장 | 5,066,670 | 200,000 | 200,000 | 200,000 | 5,666,670 | 2 |
| 00003 | 임서화 | 팀장 | 2,290,000 | 200,000 | 200,000 | - | 2,690,000 | 1 |
| 00002 | 채우리 | 팀장 | 1,800,000 | 200,000 | 200,000 | - | 2,200,000 | 3 |

- 식대(200,000), 차량유지비(200,000), 보육수당(200,000)은 **비과세**
- 4대보험·소득세 산정 기준 = **과세 급여(기본급)만**
- 가족수는 본인 포함

### 대표이사 특이사항 (전상우)

- **고용보험 제외** (대표이사는 고용보험 가입 대상 아님)
- **산재보험 제외**
- 국민연금, 건강보험만 적용
- 비과세 항목 없음
- 과세급여 770천원 미만이므로 소득세 0원

### 은행 계좌 정보

| 성명 | 은행 | 계좌번호 | 휴대폰 |
|------|------|---------|--------|
| 전상우 | 농협은행 | 3019337958141 | 01093379581 |
| 채우리 | 기업은행 | 61302711601013 | 01050560630 |
| 임서화 | 우리은행 | 1002454113405 | 01025447129 |
| 박정우 | 우리은행 | 1002061760423 | 01095004383 |

---

## 3. 계산 로직

### 반올림 규칙 (매우 중요)

**모든 보험료 계산: Decimal 정밀 연산 → 원 미만 절사 → 10원 미만 절사**

```javascript
// JavaScript 구현 (부동소수점 오차 방지)
function calcInsurance(taxableAmount, rateString) {
  // 정수 연산으로 부동소수점 오차 방지
  // taxableAmount: 정수 (원)
  // rateString: 문자열 ('0.0475')
  
  // 방법 1: 문자열 기반 정수 연산
  const [, decimal] = rateString.split('.');
  const rateMultiplier = parseInt(decimal.padEnd(6, '0')); // 6자리 정수화
  const rawResult = taxableAmount * rateMultiplier;
  const wonResult = Math.floor(rawResult / 1000000); // 원 미만 절사
  return Math.floor(wonResult / 10) * 10; // 10원 미만 절사
  
  // 방법 2: Decimal 라이브러리 사용 (권장)
  // const Decimal = require('decimal.js');
  // const result = new Decimal(taxableAmount).mul(rateString);
  // const truncated = result.floor(); // 원 미만 절사
  // return truncated.div(10).floor().mul(10).toNumber(); // 10원 절사
}
```

⚠️ **`float * float`는 절대 사용하지 마.** `1800000 * 0.009 = 16199.999...`처럼 부동소수점 오차 발생.

### 2026년 4대보험 요율

| 항목 | 근로자 | 사업자 | 산정 기준 |
|------|--------|--------|----------|
| 국민연금 | 4.75% | 4.75% | 과세급여 |
| 건강보험 | 3.595% | 3.595% | 과세급여 |
| 장기요양보험 | 13.14% | 13.14% | **건강보험료** (절사 후 금액 기준) |
| 고용보험 | 0.9% | 1.15% (0.9%+0.25%) | 과세급여, **대표이사 제외** |
| 산재보험 | - | 0.95% | 과세급여, **대표이사 제외** |

- 장기요양보험 = `ROUNDDOWN(건강보험료 × 0.1314)` — 건강보험료는 이미 10원 절사된 금액
- 고용보험 사업자 1.15% = 고용보험 0.9% + 고용안정부담금 0.25%

### 소득세 계산

국세청 2026년 근로소득 간이세액표 기반 조회:

1. 과세급여(비과세 제외)를 **천원 단위**로 환산
2. 770천원 미만 → 세액 **0원**
3. 770천원 ~ 10,000천원 → 간이세액표 테이블에서 **구간 + 가족수**로 조회
4. 10,000천원 초과 → 별도 계산식 (현재 해당 직원 없음)

간이세액표는 `근로소득_간이세액표.xlsx`의 '근로소득간이세액표' 시트에서 추출하여 DB에 적재한다.
- Row 5~651: 테이블 데이터
- Col A: 이상(천원), Col B: 미만(천원), Col C~M: 가족수 1~11명 세액
- 값이 '-'이면 0원

### 지방소득세

```
지방소득세 = ROUNDDOWN(소득세 × 10%, 10원 미만 절사)
```

### 2월 급여 대장 검증 결과 (전 항목 100% 일치)

| 직원 | 국민연금 | 건강보험 | 장기요양 | 고용보험 | 소득세 | 지방소득세 | 실수령액 |
|------|---------|---------|---------|---------|-------|----------|---------|
| 전상우 | 19,000 ✅ | 14,380 ✅ | 1,880 ✅ | 0 ✅ | 0 ✅ | 0 ✅ | 364,740 ✅ |
| 박정우 | 240,660 ✅ | 182,140 ✅ | 23,930 ✅ | 45,600 ✅ | 315,080 ✅ | 31,500 ✅ | 4,827,760 ✅ |
| 임서화 | 108,770 ✅ | 82,320 ✅ | 10,810 ✅ | 20,610 ✅ | 28,840 ✅ | 2,880 ✅ | 2,435,770 ✅ |
| 채우리 | 85,500 ✅ | 64,710 ✅ | 8,500 ✅ | 16,200 ✅ | 2,630 ✅ | 260 ✅ | 2,022,200 ✅ |

사업자 부담 전표 금액도 전부 일치:
- 국민연금: 453,930 ✅ / 건강+장기요양: 388,670 ✅ / 고용보험: 105,290 ✅ / 산재보험: 86,980 ✅

---

## 4. DB 스키마

### employees
```sql
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  employee_code VARCHAR(10) NOT NULL,      -- 이카운트 사원번호
  name VARCHAR(50) NOT NULL,
  position VARCHAR(20),                     -- 사장, 팀장
  department VARCHAR(50),
  is_ceo BOOLEAN DEFAULT false,             -- 대표이사 여부
  base_salary INTEGER NOT NULL,             -- 기본급 (과세)
  meal_allowance INTEGER DEFAULT 0,         -- 식대 (비과세)
  car_allowance INTEGER DEFAULT 0,          -- 차량유지비 (비과세)
  childcare_allowance INTEGER DEFAULT 0,    -- 보육수당 (비과세)
  dependents INTEGER DEFAULT 1,             -- 공제대상가족 수
  bank_name VARCHAR(20),
  bank_account VARCHAR(30),
  phone VARCHAR(15),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### insurance_rates
```sql
CREATE TABLE insurance_rates (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE,
  national_pension DECIMAL(6,4) NOT NULL,       -- 0.0475
  health_insurance DECIMAL(6,4) NOT NULL,       -- 0.03595
  long_term_care DECIMAL(6,4) NOT NULL,         -- 0.1314 (건강보험의 비율)
  employment_worker DECIMAL(6,4) NOT NULL,      -- 0.009
  employment_employer DECIMAL(6,4) NOT NULL,    -- 0.009
  employment_stability DECIMAL(6,4) NOT NULL,   -- 0.0025
  industrial_accident DECIMAL(6,4) NOT NULL,    -- 0.0095
  created_at TIMESTAMP DEFAULT NOW()
);
```

### tax_brackets (간이세액표)
```sql
CREATE TABLE tax_brackets (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  salary_from INTEGER NOT NULL,    -- 이상 (천원)
  salary_to INTEGER NOT NULL,      -- 미만 (천원)
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
);
```

### payrolls (급여 대장)
```sql
CREATE TABLE payrolls (
  id SERIAL PRIMARY KEY,
  year_month VARCHAR(7) NOT NULL UNIQUE,    -- '2026-03'
  payment_date DATE,
  status VARCHAR(20) DEFAULT 'draft',       -- draft / confirmed / voucher_created / completed
  total_gross INTEGER DEFAULT 0,
  total_deductions INTEGER DEFAULT 0,
  total_net INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### payroll_details (직원별 급여 상세)
```sql
CREATE TABLE payroll_details (
  id SERIAL PRIMARY KEY,
  payroll_id INTEGER REFERENCES payrolls(id),
  employee_id INTEGER REFERENCES employees(id),
  base_salary INTEGER NOT NULL,             -- 스냅샷
  meal_allowance INTEGER DEFAULT 0,
  car_allowance INTEGER DEFAULT 0,
  childcare_allowance INTEGER DEFAULT 0,
  gross_pay INTEGER NOT NULL,               -- 지급총액
  national_pension INTEGER DEFAULT 0,
  health_insurance INTEGER DEFAULT 0,
  long_term_care INTEGER DEFAULT 0,
  employment_insurance INTEGER DEFAULT 0,
  income_tax INTEGER DEFAULT 0,
  local_income_tax INTEGER DEFAULT 0,
  total_deductions INTEGER DEFAULT 0,       -- 공제합계
  net_pay INTEGER NOT NULL,                 -- 실수령액
  UNIQUE(payroll_id, employee_id)
);
```

### payroll_vouchers (전표 데이터)
```sql
CREATE TABLE payroll_vouchers (
  id SERIAL PRIMARY KEY,
  payroll_id INTEGER REFERENCES payrolls(id),
  line_no INTEGER NOT NULL,                 -- 1~12
  division VARCHAR(10) NOT NULL,            -- '3차' / '4대'
  account_code VARCHAR(10) NOT NULL,
  account_name VARCHAR(30) NOT NULL,
  partner_code VARCHAR(10) NOT NULL,
  partner_name VARCHAR(30) NOT NULL,
  debit INTEGER DEFAULT 0,
  credit INTEGER DEFAULT 0,
  description VARCHAR(100),
  UNIQUE(payroll_id, line_no)
);
```

### payroll_logs (처리 로그)
```sql
CREATE TABLE payroll_logs (
  id SERIAL PRIMARY KEY,
  payroll_id INTEGER REFERENCES payrolls(id),
  step VARCHAR(30) NOT NULL,    -- calculate / compare / voucher / bank_excel / settle
  status VARCHAR(10) NOT NULL,  -- success / error
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. 급여 전표 구조 (고정 12행)

이카운트에 업로드할 전표. 금액만 매월 변동, 구조는 고정.

| 행 | 구분 | 코드 | 계정명 | 거래처코드 | 거래처명 | 차변 | 대변 |
|----|------|------|--------|----------|---------|------|------|
| 1 | 3차 | 8029 | 직원급여(판) | 11132 | 어센더즈 임직원 | **지급총액** | |
| 2 | 4대 | 2549 | 예수금 | 00001 | 세무서 | | **소득세 합계** |
| 3 | 4대 | 2549 | 예수금 | 11112 | 서울시 | | **지방소득세 합계** |
| 4 | 4대 | 2549 | 예수금 | 11128 | 국민연금 | | **국민연금(근로자) 합계** |
| 5 | 4대 | 2549 | 예수금 | 11129 | 건강보험 | | **건강+장기요양(근로자) 합계** |
| 6 | 4대 | 2549 | 예수금 | 11130 | 고용보험 | | **고용보험(근로자) 합계** |
| 7 | 3차 | 8109 | 복리후생비(판) | 11128 | 국민연금 | **국민연금(사업자) 합계** | |
| 8 | 3차 | 8269 | 보험료(판) | 11129 | 건강보험 | **건강+장기요양(사업자) 합계** | |
| 9 | 3차 | 8269 | 보험료(판) | 11130 | 고용보험 | **고용보험+안정(사업자) 합계** | |
| 10 | 4대 | 2539 | 미지급금 | 11132 | 어센더즈 임직원 | | **실수령액 합계** |
| 11 | 4대 | 2539 | 미지급금 | 11137 | 4대보험 | | **사업자부담 4대보험 합계** |
| 12 | 3차 | 8269 | 보험료(판) | 11131 | 산재보험 | **산재보험(사업자) 합계** | |

**적요**: 행1,7,8,9,12 = "YYYY년 MM월 급여대장"

**금액 계산 공식:**
- 행5 대변 = Σ(건강보험 근로자) + Σ(장기요양 근로자)
- 행8 차변 = Σ(건강보험 사업자) + Σ(장기요양 사업자)
- 행9 차변 = Σ(과세급여 × 1.15%) — 대표이사 제외
- 행10 대변 = Σ(실수령액)
- 행11 대변 = 행7 차변 + 행8 차변 + 행9 차변 + 행12 차변
- 차변 합계 = 대변 합계 (대차 일치 필수)

---

## 6. API 설계

### 직원 관리
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | /api/employees | 전체 직원 목록 |
| GET | /api/employees/:id | 직원 상세 |
| PUT | /api/employees/:id | 직원 정보 수정 |
| POST | /api/employees | 직원 추가 |

### 보험 요율
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | /api/rates/:year | 요율 조회 |
| PUT | /api/rates/:year | 요율 수정 |

### 급여 처리 (핵심)
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | /api/payroll/calculate | 급여 자동 계산 (body: { yearMonth, paymentDate }) |
| GET | /api/payroll/:yearMonth | 급여 대장 조회 |
| GET | /api/payroll/:yearMonth/details | 직원별 상세 |
| PUT | /api/payroll/:id/confirm | 대장 확정 (draft→confirmed) |
| PUT | /api/payroll/:id/detail/:detailId | 개별 항목 수정 |

### 전표 / 엑셀 / 알림
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | /api/payroll/:id/voucher | 전표 데이터 생성 |
| POST | /api/payroll/:id/voucher/upload | 이카운트 자동 업로드 (Playwright) |
| GET | /api/payroll/:id/bank-excel | 하나은행 엑셀 다운로드 |
| POST | /api/payroll/:id/notify | 텔레그램 알림 |
| POST | /api/payroll/:id/settle | 반제 전표 생성 |
| GET | /api/payroll/:id/compare | 이카운트 비교 |

### 대시보드
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | /api/payroll/history | 월별 처리 이력 |
| GET | /api/payroll/:id/status | 단계별 상태 |
| GET | /api/payroll/:id/logs | 처리 로그 |

---

## 7. 하나은행 대량이체 엑셀

### 양식 (.xls 형식 필수)

**Sheet1** (데이터):
| A. 입금은행 | B. 입금계좌번호 | C. 입금액 | D. 예상예금주 | E. 입금통장표시 | F. 출금통장표시 | G. 메모 | H. CMS코드 | I. 받는분 휴대폰번호 |
|------------|---------------|----------|-------------|---------------|---------------|--------|-----------|-------------------|
| 농협은행 | 3019337958141 | 364740 | 전상우 | 급여-어센더즈 | 26년 2월 급여 | | | 01093379581 |

- E열 고정: "급여-어센더즈"
- F열: "YY년 MM월 급여" 형식
- Sheet2: 양식 설명 (기존 파일에서 그대로 복사)

---

## 8. 텔레그램 알림

Chat ID: `35391597` / HTML parse mode / 실패 시 plain text 폴백

### 알림 유형
| 단계 | 내용 |
|------|------|
| 급여 계산 | 월별 요약 (총 지급액, 공제액, 실수령액, 직원별 실수령액) |
| 이카운트 비교 | 차이 항목 리스트 (있을 경우) |
| 전표 업로드 | 성공/실패 |
| 은행 엑셀 | 이체 대상자, 금액, 합계 |
| 오류 | 에러 메시지 (특수문자 이스케이프 필수) |

---

## 9. 이카운트 연동 (Playwright)

### 급여 대장 생성
- 메뉴: 회계 II > 급여관리
- 신규(F2) 클릭 → 급여정보입력 창
- 입력: 귀속연월, 세금관련(정산기간), 대상기간, 지급일, 지급연월, 급여대장명칭
- 대상항목: 전체, 대상사원: 전체
- 저장(F8)

### 급여 대장 비교
- 급여 대장 목록에서 해당 월 → 급여대장 버튼 → 조회
- 직원별 금액 스크래핑 → 봇 계산값과 diff

### 전표 생성
- 급여 대장 목록 → 급여대장 드롭다운 → 전표생성
- 또는 FastEntry 직접 업로드 (회계봇 패턴 재사용)

---

## 10. 개발 우선순위

| Phase | 작업 | 산출물 |
|-------|------|--------|
| 1 | 백엔드 기본 구조 + DB 마이그레이션 + 급여 계산 엔진 | API 서버, 단위 테스트 |
| 2 | 간이세액표 DB 적재 + 급여 대장 API 완성 | 전체 급여 계산 API |
| 3 | 프론트엔드 대시보드 | 메인 화면 |
| 4 | 전표 생성 + 하나은행 엑셀 | 전표 API, 엑셀 다운로드 |
| 5 | 텔레그램 + 이카운트 Playwright | 자동 업로드, 알림 |
| 6 | 이카운트 비교 + 반제 처리 | 비교 리포트, 반제 전표 |
