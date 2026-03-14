# 급여 자동화 봇 (Payroll Bot) - 백엔드

## 프로젝트 개요

어센더즈 주식회사의 월급여 처리를 자동화하는 EV System 봇.
급여 계산 → 이카운트 비교 → 전표 생성 → 은행 이체 엑셀 → 반제 처리까지 5단계 자동화.

## 인프라

- **백엔드**: Express.js + PostgreSQL → Railway 배포
- **프론트엔드**: Next.js (별도 레포 ev-dashboard, 경로: `C:\Projects\ev-dashboard\app\payroll\`)
- **대시보드 URL**: https://ev-dashboard-vert.vercel.app/payroll
- **텔레그램**: Chat ID `35391597`
- **이 프로젝트 경로**: `C:\EV-System\EV3-Managing\payroll-bot\`
- **GitHub**: greenwhale777/payroll-bot

## ⚠️ DB 안전 규칙 (절대 준수)

1. **DROP TABLE, TRUNCATE, DELETE FROM은 절대 실행하지 마.** 필요하면 먼저 나에게 확인을 받아.
2. **ALTER TABLE로 컬럼 삭제(DROP COLUMN)도 금지.**
3. DB 스키마를 변경해야 하면 **ALTER TABLE ADD COLUMN만 허용.**
4. 기존 테이블 구조를 바꾸지 말고, **코드(쿼리)를 현재 DB에 맞춰 수정해.**
5. DB 변경 전에 반드시 **현재 행 수와 스키마를 출력하고 나에게 보고해.**
6. DB 테이블 DROP이 필요한 경우에도, 먼저 **SELECT COUNT(*)로 데이터 확인**하고 **데이터가 있으면 백업 SQL을 생성**한 후 **사용자 승인**을 받아.

## 📁 파일 안전 규칙

7. 파일을 삭제하거나 덮어쓰기 전에 반드시 **백업 복사본을 먼저 만들어.**
8. **여러 파일을 동시에 수정하지 마.** 한 파일씩 수정하고 결과를 확인한 후 다음 파일로 넘어가.
9. 수정 전에 반드시 `git diff`로 변경 내용을 확인해.

## 🔧 코드 수정 규칙

10. **최소한의 변경만 해.** 요청받은 부분만 수정하고, 관련 없는 코드는 건드리지 마.
11. 수정 후 반드시 **기존 기능이 깨지지 않았는지 확인해.**
12. 환경변수(.env)는 절대 삭제하거나 덮어쓰지 마. **추가만 허용.**

## 🚨 절대 하지 말 것

- 다른 프로젝트(회계봇, 캐시봇, 캘린더봇, TikTok 분석 등)의 파일이나 DB 테이블 수정
- Railway PostgreSQL에 직접 접속하여 데이터 삭제
- `.env` 파일 내용 삭제 또는 덮어쓰기
- 프론트엔드 코드 수정 (프론트엔드는 ev-dashboard 레포에서 별도 작업)

## 📝 작업 규칙

- **대화는 한글로 진행한다.**
- **코드 작성이 끝나면 git add, commit, push까지 자동으로 한다.** Railway가 git push 시 자동 배포. 커밋 메시지도 한글로 작성.

## 📋 기술 스펙

상세 기술 명세는 `PAYROLL-SPEC.md`를 참조할 것.
DB 스키마, API 설계, 계산 로직, 전표 구조, 하나은행 엑셀 양식 등 모든 기술 상세가 포함되어 있다.
