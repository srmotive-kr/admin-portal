// 연간 정기 관리 항목 — 개발사 및 고객 담당 해야할 일
// checklist artifact(a1fc9e60)의 내용을 모두 포함

const DEV_BG = '#EFF6FF'; const DEV_COLOR = '#1D4ED8';
const USR_BG = '#F0FDF4'; const USR_COLOR = '#16A34A';
const WARN_BG = '#FFFBEB'; const WARN_COLOR = '#D97706';

const t = {
  h1: { fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 4 },
  sub: { fontSize: 13, color: '#64748B', marginBottom: 24 },
  legend: {
    display: 'flex', gap: 12, flexWrap: 'wrap',
    marginBottom: 24, padding: '12px 16px',
    background: '#fff', border: '1px solid #E2E8F0',
    borderRadius: 8,
  },
  badge: (bg, color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 20,
    fontSize: 11.5, fontWeight: 600,
    background: bg, color,
  }),
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 13, fontWeight: 700, letterSpacing: '.05em',
    textTransform: 'uppercase', color: '#64748B',
    marginBottom: 10, paddingBottom: 6,
    borderBottom: '2px solid #E2E8F0',
  },
  table: {
    width: '100%', borderCollapse: 'collapse',
    background: '#fff', border: '1px solid #E2E8F0',
    borderRadius: 8, overflow: 'hidden', fontSize: 13,
  },
  th: {
    padding: '8px 12px', background: '#F8FAFC',
    textAlign: 'left', fontSize: 11.5, fontWeight: 700,
    color: '#64748B', borderBottom: '1px solid #E2E8F0',
    whiteSpace: 'nowrap',
  },
  td: { padding: '9px 12px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'top' },
  who: (bg, color) => ({
    display: 'inline-block', padding: '1px 7px', borderRadius: 10,
    fontSize: 11, fontWeight: 700, background: bg, color,
    whiteSpace: 'nowrap',
  }),
  itemName: { fontWeight: 600, color: '#0F172A' },
  desc: { fontSize: 11.5, color: '#64748B', marginTop: 3, lineHeight: 1.5 },
  path: {
    display: 'inline-block', fontSize: 11.5, color: '#475569',
    background: '#F1F5F9', padding: '2px 7px',
    borderRadius: 4, marginTop: 3,
  },
  warn: {
    fontSize: 11.5, color: WARN_COLOR,
    background: WARN_BG, padding: '3px 7px',
    borderRadius: 4, marginTop: 3, display: 'inline-block',
  },
  values: {
    background: '#F8FAFC', border: '1px solid #E2E8F0',
    borderRadius: 4, padding: '6px 10px',
    fontSize: 11.5, fontFamily: 'monospace',
    lineHeight: 1.8, marginTop: 5,
    overflowX: 'auto', display: 'block',
  },
  ok: { fontSize: 11.5, color: '#16A34A', marginTop: 3 },
}

function Who({ type }) {
  return type === 'dev'
    ? <span style={t.who(DEV_BG, DEV_COLOR)}>🛠 개발사</span>
    : <span style={t.who(USR_BG, USR_COLOR)}>👤 고객</span>
}

function Table({ rows }) {
  return (
    <table style={t.table}>
      <thead>
        <tr>
          <th style={{ ...t.th, width: 90 }}>시기</th>
          <th style={{ ...t.th, width: 80 }}>담당</th>
          <th style={{ ...t.th, width: 180 }}>항목</th>
          <th style={t.th}>내용 및 방법</th>
          <th style={{ ...t.th, width: 180 }}>경로 / 위치</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={t.td}><span style={{ fontWeight: 600, fontSize: 12 }}>{r.timing}</span></td>
            <td style={t.td}><Who type={r.who} /></td>
            <td style={t.td}><div style={t.itemName}>{r.item}</div></td>
            <td style={t.td}>
              <div>{r.detail}</div>
              {r.values && <div style={t.values}>{r.values}</div>}
              {r.warn  && <div style={t.warn}>⚠ {r.warn}</div>}
              {r.ok    && <div style={t.ok}>✓ {r.ok}</div>}
            </td>
            <td style={t.td}>
              {r.path && <div style={t.path}>{r.path}</div>}
              {r.src  && <div style={{ ...t.desc, marginTop: 4 }}>{r.src}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const SECTIONS = [
  {
    title: 'A. 매년 1월 — 새 회계연도 개시',
    rows: [
      {
        timing: '매년 1월', who: 'dev', item: '건강·장기요양·고용보험 요율 신규 연도 추가',
        detail: '보건복지부·고용노동부 고시 확인 후 Admin Portal Seed 편집기 → [4대보험요율] 탭에서 신규 연도 행 추가. 씨드 동기화 시 자동 반영.',
        values: '2024: 건강 7.09%, 장기요양 12.95%, 고용 1.8%\n2025: 건강 7.09%, 장기요양 12.95%, 고용 1.8% (동결)\n2026: 건강 7.19%(각 3.595%), 장기요양 13.14%, 고용 1.8% ✓ 확정',
        warn: 'taxDeduction.js DEFAULT_RATES.year 및 요율값도 동기화 필요',
        path: 'Admin Portal → Seed 편집기 → 4대보험요율',
        src: 'insurance_rates 테이블',
      },
      {
        timing: '매년 1월', who: 'dev', item: '최저임금 신규 연도 추가',
        detail: '고용노동부 고시(전년도 8월 확정) 확인 후 minimum_wage 테이블에 신규 연도 행 추가.',
        values: 'MINIMUM_WAGE_2024 = 9,860원\nMINIMUM_WAGE_2025 = 10,030원\nMINIMUM_WAGE_2026 = 10,320원',
        warn: 'EmpSalary.jsx:237 fallback 하드코딩도 동기화 필요',
        path: 'minimum_wage 테이블',
        src: 'src/db/patches/v1.35.0.sql:228',
      },
      {
        timing: '매년 1월', who: 'dev', item: '공휴일 신규 연도 등록',
        detail: '시드 데이터에는 2026년까지만 공휴일 등록. 2027년 이후는 패치로 배포. 임시공휴일·선거일도 매년 확인 후 포함.',
        path: 'src/db/seeds/003_seed_holidays.sql',
        src: 'holidays 테이블 / HolidayManager 화면(조회)',
      },
      {
        timing: '매년 1월 (변경 시)', who: 'dev', item: '근로소득 간이세액표 업로드',
        detail: '국세청 고시 변경 시 Admin Portal Seed 편집기 → [근로소득세액표] 탭에서 Excel 업로드. 시행일(apply_from) 기준 버전 관리.',
        values: '2024-01-01: 기존 세액표\n2026-03-01: 2026.02.27 개정, 자녀공제 조정 ✓ 업로드 완료',
        ok: '10,000,000원 초과 구간은 income_tax_excess_rate 테이블에서 동적 조회 (소스 수정 불필요)',
        path: 'Admin Portal → Seed 편집기 → 근로소득세액표',
        src: 'income_tax_table / income_tax_excess_rate 테이블',
      },
    ],
  },
  {
    title: 'B. 매년 4월 — 건강·고용보험 보수월액 정산',
    rows: [
      {
        timing: '매년 4월', who: 'user', item: '직원별 건강·고용보험 보수월액 업데이트',
        detail: '건강보험공단에서 전년도 보수총액 기준 보수월액 재산정 통보 → 직원별 업데이트 필요.\n조회: 사회보험통합징수포털(si4n.nhis.or.kr) → 고지내역조회 → 보험료산출내역조회 → 산출내역(개인별)',
        path: '채용정보 → 4대보험 탭 → 건강보험·고용보험 보수월액',
        src: 'employees.health_ins_amount / employ_ins_amount',
      },
      {
        timing: '매년 4월', who: 'user', item: '건강·고용보험 연간 정산 처리',
        detail: '정산업무 → 건강·고용보험 정산 탭에서 연간 보수총액 기준 정산 처리. 정산 결과(환급/환수)를 귀속월 선택 후 급여에 반영.',
        path: '정산업무 → 건강·고용보험 정산',
      },
    ],
  },
  {
    title: 'C. 매년 7월 — 국민연금 기준소득월액 변경',
    rows: [
      {
        timing: '매년 7월', who: 'dev', item: '국민연금 기준소득월액 상한·하한 갱신',
        detail: '보건복지부 고시 확인 후 반기별 키 추가. insurance_rates의 pension_upper/lower_limit 및 반기 키 모두 갱신.',
        values: 'PENSION_UPPER_2023H2 = 5,900,000 (2023.07~2024.06)\nPENSION_UPPER_2024H2 = 6,170,000 (2024.07~2025.06)\nPENSION_UPPER_2025H2 = 6,370,000 (2025.07~2026.06)\nPENSION_UPPER_2026H2 = 6,590,000 (2026.07~) ✓ 확정\nPENSION_LOWER_2026H2 = 410,000 (2026.07~) ✓ 확정',
        path: 'Admin Portal → Seed 편집기 또는 패치 SQL',
        src: 'system_config.PENSION_UPPER_{년도}H2 / insurance_rates',
      },
      {
        timing: '매년 7월', who: 'user', item: '직원별 국민연금 기준소득월액 업데이트',
        detail: '국민연금EDI서비스에서 결정된 직원별 기준소득월액 확인 후 채용정보 → 4대보험 탭 업데이트.\n조회: 국민연금EDI서비스 → 결정내역 → 국민연금보험료 결정내역 → 가입자내역(탭)',
        path: '채용정보 → 4대보험 탭 → 국민연금 기준소득월액',
        src: 'employees.pension_amount',
      },
    ],
  },
  {
    title: 'D. 연초 (1~2월) — 연말정산 및 연차 정산',
    rows: [
      {
        timing: '1~2월', who: 'user', item: '근로소득 연말정산 결과 입력',
        detail: '시스템 자체 자동계산 미지원. 국세청 홈택스 또는 세무사를 통해 확정세액 산출 후 정산업무 → 근로소득 정산 탭에서 환급/환수 금액만 입력 → 급여에 반영.',
        path: '정산업무 → 근로소득 정산',
      },
      {
        timing: '1~2월', who: 'user', item: '미사용 연월차 현금 정산',
        detail: '회사 방침에 따라 미사용 연차에 대해 수당 지급 처리.\n• 회계년도 기준 연차: 매년 12.31 만료 → 이듬해 1월 급여에서 일괄 정산 (1~2월 집중)\n• 입사일 기준 연차: 직원별 만료일이 다르므로 만료 익월 급여에 개별 반영',
        path: '정산업무 → 연월차 정산',
      },
      {
        timing: '1~2월', who: 'user', item: '미사용 보상휴가 현금 정산',
        detail: '초과근무보상을 보상휴가로 설정한 직원에 대해 미사용 보상휴가를 현금으로 정산.\n대상: 채용정보 → 급여정보에서 초과근무보상 = 보상휴가로 설정된 직원.',
        path: '정산업무 → 보상휴가 정산',
      },
    ],
  },
  {
    title: 'E. 법령 개정 시 — 소스코드 수정이 필요한 항목',
    rows: [
      {
        timing: '소득세법 시행규칙', who: 'dev', item: '간이세액표 고소득 구간 초과세율',
        detail: '10,000,000원 초과 구간은 income_tax_excess_rate 테이블에서 동적 조회 (Admin Portal Seed 편집기에서 수정, 소스 수정 불필요). DB 미연결 시 fallback 전용 상수만 소스코드 수정 필요.',
        src: 'income_tax_excess_rate 테이블 (주) / src/lib/salary/taxDeduction.js:94-98 (fallback)',
      },
      {
        timing: '소득세법 제48조', who: 'dev', item: '퇴직소득세 공제·세율 구조',
        detail: '근속연수공제, 환산급여공제, 기본세율 구조.\n법령 개정 시 소스코드 직접 수정 필요.',
        src: 'src/lib/payroll/retireCalc.js:340-373',
      },
      {
        timing: '소득세법 시행령', who: 'dev', item: '식대·교통비 비과세 한도',
        detail: '200,000원/월 이 3곳에 중복 하드코딩. 법 개정 시 3곳 모두 수정 필요.',
        warn: '3곳 동시 수정 필요 (payrollCalc.js, ipc/index.js, EmpSalary.jsx)',
        src: 'src/lib/salary/payrollCalc.js:15-18 / src/ipc/index.js:6112 / src/components/pages/EmpSalary.jsx:382',
      },
      {
        timing: '근로기준법 제60조', who: 'dev', item: '법정 연차 발생 기준',
        detail: '1년 미만: 월 1일 / 1년 이상: 기본 15일 / 2년마다 +1일 / 상한 25일',
        src: 'src/lib/leave/annualLeaveCalc.js:39-43',
      },
      {
        timing: '근로기준법', who: 'dev', item: '월 소정근로시간 209시간',
        detail: '통상시급, 환산월급 계산의 기준. 주40h 기준 (40+8)×365/12/7 = 209',
        src: 'src/lib/salary/baseCalc.js:8',
      },
      {
        timing: '퇴직급여법 제8조', who: 'dev', item: '법정퇴직금 계산식',
        detail: '평균임금 × 30 × 근속일수 / 365',
        src: 'src/lib/payroll/retireCalc.js:300-301',
      },
      {
        timing: '고용보험법 시행령', who: 'dev', item: '출산·육아 고용보험 지원기준',
        detail: '신규 연도 데이터를 Admin Portal Seed 편집기 → [출산육아] 탭 또는 gov_leave_benefit_rates 테이블에 패치 SQL로 추가.',
        values: '출산휴가 EI 상한: 2,200,000원 (2026년)\n배우자출산휴가: 20일, 상한 1,684,210원 (2026년)\n육아휴직: 6개월 이내 2,500,000원, 7개월~ 1,600,000원',
        src: 'gov_leave_benefit_rates 테이블 / src/db/patches/v1.53.0.sql:21',
      },
    ],
  },
]

export default function ChecklistPage() {
  return (
    <div>
      <div style={t.h1}>연간 정기 관리 항목</div>
      <div style={t.sub}>개발사(운영자)와 고객(사용자)이 매년 또는 법령 개정 시 수행해야 하는 항목 목록 (2026.07 기준)</div>

      <div style={t.legend}>
        <span style={t.badge(DEV_BG, DEV_COLOR)}>🛠 개발사 (운영자)</span>
        <span style={t.badge(USR_BG, USR_COLOR)}>👤 고객 (사용자)</span>
        <span style={t.badge(WARN_BG, WARN_COLOR)}>⚠ 소스코드 수정 필요</span>
      </div>

      {SECTIONS.map((sec, i) => (
        <div key={i} style={t.section}>
          <div style={t.sectionTitle}>{sec.title}</div>
          <Table rows={sec.rows} />
        </div>
      ))}
    </div>
  )
}
