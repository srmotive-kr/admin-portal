import { useEffect, useState, useCallback, useRef, Fragment } from 'react'
import { supabase } from '../lib/supabaseClient'

// 시드 데이터 저장 성공 시 반드시 호출 — planner_seed_sync_meta.last_updated_at을 직접
// 갱신한다. Smart HR+ SeedEditor.jsx의 touchSyncMeta()와 동일한 이유(트리거만 믿지 않고
// 저장 시점에 명시적으로 찍어야 seedSync.js의 버전 비교가 변경을 놓치지 않음) — 물리적으로
// 분리된 Planner+ 전용 메타 테이블([[project_xpns_tp_hardcoding_removal]] 참고)이라 HR+의
// seed_sync_meta와는 완전히 독립적으로 갱신된다.
async function touchSyncMeta() {
  const { error } = await supabase
    .from('planner_seed_sync_meta')
    .update({ last_updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) console.error('[touchSyncMeta]', error.message)
}

// 저장 결과 안내(2026-09-04, SeedEditor.jsx의 MsgModal과 동일한 이유) — 토스트(인라인 알림
// 박스)로는 "저장 완료" 메시지가 화면에서 순식간에 사라져(1~2프레임, 육안 인지 불가) 사용자가
// 결과를 확인할 수 없었다. 리액트 렌더링에 아예 의존하지 않는 브라우저 네이티브 alert()로
// 대체한다 — alert()는 동기 블로킹 호출이라 사용자가 직접 닫기 전까지 물리적으로 사라질 수 없다.
function MsgModal({ msg, onClose }) {
  useEffect(() => {
    if (!msg) return
    window.alert(msg.text)
    onClose()
  }, [msg])
  return null
}

// Smart Planner+ 전용 참조/설정 데이터 편집기 — SeedEditor.jsx(Smart HR+ 전용)와는 완전히
// 독립적인 컴포넌트다. 테이블·필드 구성 전부 Smart Planner+ 로컬 SQLite
// (C:\ConversionProject\smart-planner-plus\02_conversion\src\db\, src\components\pages\client\
// EnvironmentTab.jsx 등)의 실제 구조를 그대로 따른다.
//
// 화면 구성 원칙(2026-08-14 재설계, 사용자 지적 반영):
// - 실제 앱의 환경설정(EnvironmentTab.jsx) 메뉴 4개 중 "기본값관리"(은퇴/교육/결혼/상승률
//   4개 서브탭)만 시스템 전체에 적용되는 값이 있다. 나머지 3개(코드관리=저축기간 경계,
//   적정성기준, RP스크립트관리)는 전부 설계사 개인별 user_settings라 admin-portal이 관리할
//   대상이 아니라서 아예 포함하지 않는다.
// - "시스템값 | 사용자 정의" 두 그룹 중 admin-portal은 "시스템값"만 다룬다(사용자 지시) —
//   "사용자 정의"는 설계사별 재정의값이라 여기서 관리할 이유가 없다.
// - 실제 앱의 진짜 "코드관리" 메뉴(저축기간 설정)와 이름이 겹치지 않도록, code_names
//   드롭다운 코드 편집기는 "시스템코드"로 이름을 분리했다 — 환경설정에는 이 화면 자체가
//   없고(입력폼 드롭다운에서만 쓰임), 두 개념을 같은 이름으로 부르면 혼동된다.
// - "은퇴생활수준"이 코드그룹 라벨(시스템코드 > RET_LVL_TP)과 기본값관리 탭 이름으로 중복
//   등장했던 걸 정리 — 기본값관리 쪽은 실제 메뉴 이름 그대로 "은퇴"로 통일.
//
// 2026-08-15 기준 상태:
//   1) 기본값관리 4개 탭(은퇴/교육/결혼/상승률) + 시스템코드 11개 그룹 전부 로컬 앱 최신
//      패치 값으로 이관 완료.
//   2) Smart Planner+ 클라이언트 쪽 동기화 코드(seedSync.js 대응물,
//      C:\ConversionProject\smart-planner-plus\02_conversion\src\lib\seed\seedSync.js)도
//      구현 완료 — 앱 Header의 "🔄 데이터 동기화" 버튼으로 수동 내려받기(로그인 시 자동
//      트리거는 아직 없음). 국민연금 기준소득월액/재평가율/기타 설정값 탭은 admin-portal
//      UI는 있지만 실데이터 이관은 아직 진행 전.

// ─── 시스템코드(code_names) 그룹 목록 ───────────────────────────────────────────
const CODE_GROUPS = [
  { code: 'AST_TP',      label: '자산종류' },
  { code: 'XPNS_TP',     label: '지출구분' },
  { code: 'LOAN_TP',     label: '부채종류' },
  { code: 'LOAN_RPY_TP', label: '상환방식' },
  { code: 'INCM_TP',     label: '소득구분' },
  // AST_OWN_TP(주택소유구분)는 제외 — 화면·계산엔진 어디서도 안 쓰이는 죽은 코드그룹으로
  // 확인됨(client_assets.ast_own_tp 컬럼도 v0.12.0.sql에서 이미 삭제됨, 2026-08-15 확인).
  // 소유형태(자가/전세) 구분은 지금 AST_TP 코드 선택 자체(3106=전월세보증금)로 대체되어 있음.
  { code: 'AST_SAVE_TP', label: '저축방식' },
  { code: 'FML_REL_TP',  label: '가족관계' },
  { code: 'HOUS_ACQ_TP', label: '주택취득방식' },
  { code: 'EDU_LVL_TP',  label: '교육단계' },
  { code: 'FN_GOAL_TP',  label: '재무목표구분' },
  { code: 'RET_LVL_TP',  label: '은퇴생활수준(단계명)' },
]

// XPNS_TP(지출구분)만 그룹/세부항목 계층 구조라 시스템코드 탭에서 추가 컬럼(상위그룹/고정/
// 연동/툴팁/적정성역할)을 보여준다 — 나머지 11개 그룹은 단순 코드값/코드명 2컬럼 그대로.
const HIERARCHICAL_GROUPS = new Set(['XPNS_TP'])
const RATIO_ROLE_OPTIONS = [
  { value: '', label: '(없음)' },
  { value: 'danger_rate', label: '위험대비안정성 분자' },
  { value: 'savings', label: '월평균저축율 분자' },
  { value: 'loan_stability', label: '부채관리안정성 분자' },
]

// ─── 기본값관리 > 생활수준(은퇴) ───────────────────────────────────────────────
// 실제 화면(RetireDefaultsTable.jsx)은 retire_preset_defaults(14개 필드)와
// ret_level_defaults(외식/골프/여행 회당비용 3개 필드)를 한 표로 합쳐서 보여준다.
const RETIRE_TIERS = [
  { key: '1', label: '기본적인생활' },
  { key: '2', label: '표준적인생활' },
  { key: '3', label: '여유로운생활' },
  { key: '4', label: '풍족한생활' },
]
const RETIRE_TABLES = {
  retire: { name: 'planner_retire_preset_defaults', pk: 'ret_lvl_tp' },
  retlvl: { name: 'planner_ret_level_defaults',      pk: 'ret_lvl_tp' },
}
// 2026-11-19 사용자 지시 — "생활수준은 화면 레이아웃을 사용자 앱의 '생활수준별 기본값
// 관리'의 '시스템값' 영역과 동일하게 구성해줘". 기존엔 일반 TieredFieldsTab(단순 tier×field
// 표, pair 행은 한 셀에 가로로 입력칸 2개 표시)을 재사용했는데, 사용자 앱 RetireDefaultsTable.jsx
// 는 여행/외식/골프/은퇴예상연령/기대수명을 세로 2행(rowSpan)으로 나누고 "연간 필요금액
// 소계" 강조 행까지 있어 레이아웃이 달라 전용 컴포넌트(RetireSystemTable, 아래 정의)로
// 분리했다. admin-portal은 "시스템값"만 관리하므로(사용자 앱의 "사용자 정의"는 설계사별
// 로컬 설정이라 여기 대상 아님) 그 화면의 시스템값 열 그룹만 재현한다.
const RETIRE_SYS_ROWS = [
  { type: 'plain', key: 'req_bas_mn_amt', label: '기초생활비(만원/월)', table: 'retire', money: true },
  { type: 'plain', key: 'req_med_mn_amt', label: '의료비(만원/월)', table: 'retire', money: true },
  { type: 'group', label: '여행', sub: [
    { key: 'req_trvl_yr_cnt', label: '횟수/년', table: 'retire', money: false },
    { key: 'trvl_mn_cnt_xpns', label: '만원/회', table: 'retlvl', money: true },
  ]},
  { type: 'group', label: '외식', sub: [
    { key: 'req_dine_mn_cnt', label: '횟수/월', table: 'retire', money: false },
    { key: 'dine_mn_cnt_xpns', label: '만원/회', table: 'retlvl', money: true },
  ]},
  { type: 'group', label: '골프', sub: [
    { key: 'req_golf_mn_cnt', label: '횟수/년', table: 'retire', money: false },
    { key: 'golf_mn_cnt_xpns', label: '만원/회', table: 'retlvl', money: true },
  ]},
  { type: 'plain', key: 'req_cult_mn_amt', label: '문화비(만원/월)', table: 'retire', money: true },
  { type: 'computed', label: '연간 필요금액 소계' },
  { type: 'plain', key: 'req_slv_twn_amt', label: '실버타운보증금(만원)', table: 'retire', money: true },
  { type: 'plain', key: 'req_alon_liv_rt', label: '홀로생존시생활비율(%)', table: 'retire', money: false },
  { type: 'plain', key: 'req_med_rcu_trm', label: '사망전 간병기간(년)', table: 'retire', money: false },
  { type: 'plain', key: 'req_med_rcu_mn_amt', label: '간병비(만원/월)', table: 'retire', money: true },
  { type: 'group', label: '은퇴예상연령(세)', sub: [
    { key: 'man_ret_age', label: '남자', table: 'retire', money: false },
    { key: 'fem_ret_age', label: '여자', table: 'retire', money: false },
  ]},
  { type: 'group', label: '기대수명(세)', sub: [
    { key: 'man_dth_age', label: '남자', table: 'retire', money: false },
    { key: 'fem_dth_age', label: '여자', table: 'retire', money: false },
  ]},
]
// 사용자 앱 RetireDefaultsTable.jsx의 computeAnnualTotal()과 완전히 동일한 공식 — 두
// 레포가 같은 소계를 보여줘야 한다(12×(기초생활비+의료비+문화비) + 여행(회당×횟수) +
// 12×외식(회당×횟수) + 골프(회당×횟수), 골프는 연 단위라 ×12 없음).
function retireAnnualTotal(get) {
  const n = (k) => Number(get(k)) || 0
  return 12 * n('req_bas_mn_amt') + 12 * n('req_med_mn_amt')
    + n('trvl_mn_cnt_xpns') * n('req_trvl_yr_cnt')
    + 12 * (n('dine_mn_cnt_xpns') * n('req_dine_mn_cnt'))
    + n('golf_mn_cnt_xpns') * n('req_golf_mn_cnt')
    + 12 * n('req_cult_mn_amt')
}

function RetireSystemTable({ onDirtyChange }) {
  const [values, setValues]   = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [msg, setMsg]         = useState(null)
  const savingRef = useRef(false)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const load = useCallback(async () => {
    setLoading(true)
    const tableEntries = Object.entries(RETIRE_TABLES)
    const results = await Promise.all(tableEntries.map(([, t]) => supabase.from(t.name).select('*')))
    const errored = results.find(r => r.error)
    if (errored) { setMsg({ type: 'error', text: errored.error.message }); setLoading(false); return }
    const next = {}
    for (const t of RETIRE_TIERS) next[t.key] = {}
    tableEntries.forEach(([, t], i) => {
      for (const row of results[i].data || []) {
        if (next[row[t.pk]]) Object.assign(next[row[t.pk]], row)
      }
    })
    setValues(next); setDirty(false); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const displayVal = (tierKey, key, money) => {
    const raw = values[tierKey]?.[key]
    if (raw === undefined || raw === null || raw === '') return ''
    return money ? Number(raw) / 10000 : raw
  }

  const change = (tierKey, key, money, inputVal) => {
    const num = inputVal === '' ? '' : Number(inputVal)
    const raw = money ? (num === '' ? '' : num * 10000) : num
    setValues(prev => ({ ...prev, [tierKey]: { ...prev[tierKey], [key]: raw } }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      const flatFields = RETIRE_SYS_ROWS.flatMap(r => r.type === 'group' ? r.sub : r.type === 'plain' ? [r] : [])
      const upserts = []
      for (const t of RETIRE_TIERS) {
        const v = values[t.key] || {}
        for (const [tableKey, tinfo] of Object.entries(RETIRE_TABLES)) {
          const payload = { [tinfo.pk]: t.key }
          let any = false
          for (const f of flatFields.filter(fl => fl.table === tableKey)) {
            payload[f.key] = Number(v[f.key] || 0)
            any = true
          }
          if (!any) continue
          upserts.push(supabase.from(tinfo.name).upsert(payload, { onConflict: tinfo.pk }))
        }
      }
      const results = await Promise.all(upserts)
      const errored = results.find(r => r.error)
      if (errored) { setMsg({ type: 'error', text: errored.error.message }); return }
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
      touchSyncMeta()
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const sysGetter = (tierKey) => (key) => values[tierKey]?.[key] ?? 0

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>시스템값 {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: 160 }} colSpan={2}>항목 구분</th>
                {RETIRE_TIERS.map(t => <th key={t.key} style={s.th}>{t.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {RETIRE_SYS_ROWS.map((row, ri) => {
                if (row.type === 'plain') {
                  return (
                    <tr key={row.key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ ...s.td, fontWeight: 600 }} colSpan={2}>{row.label}</td>
                      {RETIRE_TIERS.map(t => (
                        <td key={t.key} style={s.td}>
                          <input style={s.input} type="text" inputMode="decimal"
                            value={displayVal(t.key, row.key, row.money)}
                            onChange={e => change(t.key, row.key, row.money, e.target.value)} />
                        </td>
                      ))}
                    </tr>
                  )
                }
                if (row.type === 'computed') {
                  return (
                    <tr key="computed" style={{ borderBottom: '1px solid #F1F5F9', background: '#DBEAFE' }}>
                      <td style={{ ...s.td, fontWeight: 700 }} colSpan={2}>{row.label}</td>
                      {RETIRE_TIERS.map(t => (
                        <td key={t.key} style={{ ...s.td, fontWeight: 700, color: '#2563EB' }}>
                          {Math.round(retireAnnualTotal(sysGetter(t.key))).toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  )
                }
                return row.sub.map((sub, si) => (
                  <tr key={`${ri}-${si}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    {si === 0 && <td style={{ ...s.td, fontWeight: 600 }} rowSpan={row.sub.length}>{row.label}</td>}
                    <td style={{ ...s.td, color: '#64748B', fontSize: 12 }}>{sub.label}</td>
                    {RETIRE_TIERS.map(t => (
                      <td key={t.key} style={s.td}>
                        <input style={s.input} type="text" inputMode="decimal"
                          value={displayVal(t.key, sub.key, sub.money)}
                          onChange={e => change(t.key, sub.key, sub.money, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── 기본값관리 > 결혼 ─────────────────────────────────────────────────────────
const WED_TIERS = [
  { key: '1', label: '신랑' },
  { key: '0', label: '신부' },
]
const WED_ROWS = [
  { key: 'wed_gift_amt',     label: '결혼전 행사(만원)',  table: 'wed', unit: 'money' },
  { key: 'wed_pre_amt',      label: '예물/혼수(만원)',    table: 'wed', unit: 'money' },
  { key: 'wed_crmny_amt',    label: '결혼식(만원)',       table: 'wed', unit: 'money' },
  { key: 'wed_trvl_amt',     label: '신혼여행(만원)',     table: 'wed', unit: 'money' },
  { key: 'wed_etc_amt',      label: '주택 및 기타(만원)', table: 'wed', unit: 'money' },
  { key: 'wed_goal_str_age', label: '평균결혼연령(세)',   table: 'wed', unit: 'raw' },
]
const WED_TABLES = { wed: { name: 'planner_wed_sex_defaults', pk: 'sx_tp' } }

// ─── 기본값관리 > 교육 ─────────────────────────────────────────────────────────
const EDU_ROWS = [
  { code: '02', label: '초등학교' }, { code: '03', label: '중등학교' },
  { code: '04', label: '고등학교' }, { code: '05', label: '전문대학' },
  { code: '06', label: '대학교' },   { code: '07', label: '대학원(석사)' },
  { code: '08', label: '대학원(박사)' }, { code: '09', label: '어학연수' },
  { code: '10', label: '해외 초등학교' }, { code: '11', label: '해외 중등학교' },
  { code: '12', label: '해외 고등학교' }, { code: '13', label: '해외 대학교' },
  { code: '14', label: '해외 대학원(석사)' }, { code: '15', label: '해외 대학원(박사)' },
]

// ─── 기본값관리 > 상승률 (system_config 고정 키 3개) ───────────────────────────
const RATE_ROWS = [
  { key: 'SYSTEM_EXP_INFL_RT',     label: '예상인플레이션율(%)' },
  { key: 'SYSTEM_EXP_EARN_INC_RT', label: '예상임금상승율(%)' },
  { key: 'SYSTEM_EXP_EDU_XPNS_RT', label: '예상교육비인상율(%)' },
]

// 재무비율 적정성 기준(기준관리 > 재무비율) — 2026-11-19 사용자 재지시로 구조를
// 바로잡음: page05.mxml(사용자 앱 원본)을 다시 확인한 결과 주의/보통/양호 3등급은 각각
// 독립 입력값이 아니라, 비율마다 상한/하한 2개(From~To)만 입력하면 3등급이 계산되어
// 나오는 파생값이었다(사용자 앱 RatioThresholdTable.jsx와 동일 로직 — 구조를 양쪽
// 레포에서 동일하게 유지해야 해서 그대로 복제함). 그래서 TieredFieldsTab(순수 tier×field
// 독립 입력)으론 표현이 안 돼 RatioRangeTab 전용 컴포넌트로 교체했다(아래 정의).
// planner_ratio_threshold_defaults는 보장자산/저축기간과 동일한 id=1 싱글톤 테이블(v0.35.0
// 대응, supabase_planner_threshold_defaults.sql 참고).
const RATIO_RANGES = [
  { key: 'loan_ast_rt', label: '부채부담비율', criterion: '총부채 / 총자산', lowerCol: 'loan_ast_rt_lower_bnd', upperCol: 'loan_ast_rt_upper_bnd', direction: 'lowerBetter' },
  { key: 'emrg_prep_rt', label: '긴급자금준비율', criterion: '유동성자산 / 월지출', lowerCol: 'emrg_prep_rt_lower_bnd', upperCol: 'emrg_prep_rt_upper_bnd', direction: 'higherBetter' },
  { key: 'avg_sav_rt', label: '월평균저축율', criterion: '월저축액 / 월수입', lowerCol: 'avg_sav_rt_lower_bnd', upperCol: 'avg_sav_rt_upper_bnd', direction: 'higherBetter' },
  { key: 'loan_mgr_rt', label: '부채관리안정성', criterion: '월부채납입금 / 월수입', lowerCol: 'loan_mgr_rt_lower_bnd', upperCol: 'loan_mgr_rt_upper_bnd', direction: 'lowerBetter' },
  { key: 'risk_mgr_rt', label: '위험대비안정성', criterion: '월보장성보험료 / 월수입', lowerCol: 'risk_mgr_rt_lower_bnd', upperCol: 'risk_mgr_rt_upper_bnd', direction: 'higherBetter' },
]

// 보장자산(기준관리) — 등급 구분 없는 전역 단일 행이라 SingletonFieldsTab 전용 컴포넌트를
// 쓴다(아래 정의). money:true인 필드는 화면엔 만원으로 보여주고 저장 시 원으로 환산한다
// (EduDefaultsTab과 동일 패턴) — 로컬 protect_asset_threshold_defaults가 원 단위로
// 저장하는 것과 맞춰야 한다(systemDefaults.js computeSystemProtectAssetDefaults 참고).
const PROTECT_ASSET_ROWS = [
  { key: 'dep_amt_rt', label: '보험료(소득금액 대비, %)' },
  { key: 'lmt_age',    label: '보장기간(세)' },
  { key: 'dth_amt',    label: '사망보험금(만원)', money: true },
  { key: 'dmg_amt',    label: '재해상해(만원)',   money: true },
  { key: 'cancer_amt', label: '암진단비(만원)',   money: true },
  { key: 'opr_amt',    label: '수술비(만원)',     money: true },
  { key: 'hosp_amt',   label: '입원비(만원)',     money: true },
]

// 저축기간(기준관리) — 2026-11-19 사용자 재지시로 구조를 바로잡음: page07.mxml을 다시
// 확인한 결과 입력값은 단기/중기 경계(LOWER)·중기/장기 경계(UPPER) 2개뿐이고, 단기/중기/
// 장기 3행은 그 2개로 계산되는 파생값이다(사용자 앱 SavTermRangeTable.jsx와 동일 로직).
// SingletonFieldsTab(단순 항목/값 나열)으론 이 파생 표시를 못 해 SavTermRangeTab 전용
// 컴포넌트로 교체했다(아래 정의). 테이블/컬럼명은 그대로(planner_savings_term_defaults).

// ─── 좌측 하위메뉴 그룹 공용 틀(Seed편집기>시스템코드와 동일한 레이아웃, 2026-11-19
// 사용자 지시) — "기본값 관리"/"기준 관리" 둘 다 상위 탭 하나 아래에 여러 카테고리를
// 좌측 세로 메뉴로 묶는다. 하위메뉴 전환 시 미저장 경고도 CodeNamesTab의 그룹 전환과
// 동일하게 건다.
// onDirtyChange(선택) — 바깥(PlannerSeedEditor)의 상위 탭 전환 가드에도 이 안의 dirty
// 상태를 같이 알려준다. 안 주면(onDirtyChange 없이 단독 사용) 내부 하위메뉴 전환 가드만
// 동작한다.
function SubmenuGroup({ items, render, onDirtyChange }) {
  const [active, setActive] = useState(items[0].key)
  const dirtyRef = useRef(false)
  const setDirty = (v) => { dirtyRef.current = v; onDirtyChange?.(v) }
  const handleSwitch = (key) => {
    if (dirtyRef.current && !window.confirm('저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?')) return
    setDirty(false)
    setActive(key)
  }
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      <div style={s.groupSidebar}>
        {items.map(it => (
          <button key={it.key}
            style={{ ...s.groupBtn, ...(active === it.key ? s.groupBtnActive : {}) }}
            onClick={() => handleSwitch(it.key)}>
            {it.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {render(active, setDirty)}
      </div>
    </div>
  )
}

// "기본값 관리" — 은퇴/교육/결혼/상승률 4개 탭을 하나로 묶고 하위메뉴로 생활수준/교육비/
// 결혼자금/상승률을 둔다(2026-11-19 사용자 지시 — 탭명은 환경설정 실제 메뉴 이름을
// 그대로 썼지만("은퇴"→"생활수준" 등은 그 메뉴의 실제 화면 타이틀인 "생활수준별 기본값
// 관리"에 맞춘 이름).
const DEFAULTS_SUBMENU = [
  { key: 'retire', label: '생활수준' },
  { key: 'edu',    label: '교육비' },
  { key: 'wed',    label: '결혼자금' },
  { key: 'rate',   label: '상승률' },
]
function DefaultsManagementGroup({ onDirtyChange: onOuterDirtyChange }) {
  return (
    <SubmenuGroup items={DEFAULTS_SUBMENU} onDirtyChange={onOuterDirtyChange} render={(active, onDirtyChange) => {
      if (active === 'retire') return <RetireSystemTable onDirtyChange={onDirtyChange} />
      if (active === 'edu')    return <EduDefaultsTab onDirtyChange={onDirtyChange} />
      if (active === 'wed')    return <TieredFieldsTab tiers={WED_TIERS} rows={WED_ROWS} tables={WED_TABLES} onDirtyChange={onDirtyChange} />
      if (active === 'rate')   return <RateDefaultsTab onDirtyChange={onDirtyChange} />
      return null
    }} />
  )
}

// "기준 관리" — 환경설정 "기준관리"(옛 적정성기준) 하위탭 3개(재무비율/보장자산/저축기간)
// 그대로(2026-11-19 사용자 지시). 기본값 관리 탭 바로 다음에 둔다.
const THRESHOLD_SUBMENU = [
  { key: 'ratio',   label: '재무비율' },
  { key: 'protect', label: '보장자산' },
  { key: 'savings', label: '저축기간' },
]
function ThresholdManagementGroup({ onDirtyChange: onOuterDirtyChange }) {
  return (
    <SubmenuGroup items={THRESHOLD_SUBMENU} onDirtyChange={onOuterDirtyChange} render={(active, onDirtyChange) => {
      if (active === 'ratio')   return <RatioRangeTab onDirtyChange={onDirtyChange} />
      if (active === 'protect') return <SingletonFieldsTab table="planner_protect_asset_threshold_defaults" rows={PROTECT_ASSET_ROWS} onDirtyChange={onDirtyChange} />
      if (active === 'savings') return <SavTermRangeTab onDirtyChange={onDirtyChange} />
      return null
    }} />
  )
}

// "R/P 스크립트" — 환경설정 "RP스크립트관리"(RpScriptPanel.jsx)의 "시스템값"(읽기전용
// 기본 대본) 19종. 2026-11-19 사용자 지시로 신설 — "기준관리" 탭 다음에 둔다. 하위메뉴
// 구성(코드/라벨/순서)은 RpScriptPanel.jsx의 SCRIPT_TYPES와 완전히 동일하게 맞춰야 한다
// (사용자가 그 화면 드롭다운 스크린샷을 그대로 참고하라고 지시) — 두 레포가 다른 순서로
// 보이면 어떤 항목이 어느 화면 대본인지 헷갈린다.
const RP_SCRIPT_SUBMENU = [
  { key: '200', label: '간편설계 : 시작' },
  { key: '201', label: '간편설계 : 은퇴설계' },
  { key: '202', label: '간편설계 : 교육자금마련' },
  { key: '203', label: '간편설계 : 주택마련' },
  { key: '204', label: '간편설계 : 결혼자금마련' },
  { key: '100', label: '상세설계 : 고객정보' },
  { key: '101', label: '상세설계 : 자산/부채현황' },
  { key: '102', label: '상세설계 : 수입/지출현황' },
  { key: '103', label: '상세설계 : 은퇴설계' },
  { key: '104', label: '상세설계 : 교육자금마련' },
  { key: '105', label: '상세설계 : 주택마련' },
  { key: '106', label: '상세설계 : 결혼자금마련' },
  { key: '107', label: '상세설계 : 기타목표설계' },
  { key: '109', label: '상세설계 : 재무목표별 자산분석/설계' },
  { key: '110', label: '상세설계 : 저축기간별 자산분석/설계' },
  { key: '111', label: '상세설계 : 사망위험 분석/설계' },
  { key: '112', label: '상세설계 : 보장자산 분석/설계' },
  { key: '113', label: '상세설계 : 자산시계열 분석' },
  { key: '114', label: '상세설계 : 현금흐름 분석' },
]
function RpScriptGroup({ onDirtyChange: onOuterDirtyChange }) {
  return (
    <SubmenuGroup items={RP_SCRIPT_SUBMENU} onDirtyChange={onOuterDirtyChange} render={(active, onDirtyChange) => (
      <RpScriptEditTab key={active} scriptTp={active} onDirtyChange={onDirtyChange} />
    )} />
  )
}

// planner_rp_script_defaults는 script_tp(PK)별로 행이 자연스럽게 나뉘는 테이블이라(id=1
// 싱글톤도, tier×field 격자도 아님) 전용 단일 텍스트 편집기를 쓴다 — 여기서 다루는 건
// "시스템값"(읽기전용 기본 대본)뿐이고, 설계사별 "사용자 정의"는 user_settings에 남아
// 이 화면 관리 대상이 아니다(RpScriptPanel.jsx와 동일 원칙).
function RpScriptEditTab({ scriptTp, onDirtyChange }) {
  const [text, setText]       = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [msg, setMsg]         = useState(null)
  const savedRef = useRef('')
  const savingRef = useRef(false)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('planner_rp_script_defaults').select('script').eq('script_tp', scriptTp).maybeSingle()
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    const v = data?.script ?? ''
    setText(v); savedRef.current = v; setDirty(false); setLoading(false)
  }, [scriptTp])

  useEffect(() => { load() }, [load])

  const change = (v) => { setText(v); setDirty(v !== savedRef.current) }

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      const { error } = await supabase.from('planner_rp_script_defaults')
        .upsert({ script_tp: scriptTp, script: text }, { onConflict: 'script_tp' })
      if (error) { setMsg({ type: 'error', text: error.message }); return }
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
      savedRef.current = text; setDirty(false)
      touchSyncMeta()
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>시스템값 {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <textarea
          // 스크롤바 없이 내용 길이에 맞춰 세로로 쭉 늘어나게(2026-11-19 사용자 지시) —
          // 사용자 앱 RpScriptPanel.jsx와 동일하게 field-sizing:content를 쓴다(브라우저가
          // 레이아웃 엔진 차원에서 내용에 맞춰 높이를 직접 계산). resize 핸들은 자동 높이
          // 조정과 충돌하므로 제거.
          style={{ width: '100%', minHeight: 360, padding: '10px 12px', border: '1.5px solid #CBD5E1', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box', resize: 'none', fieldSizing: 'content' }}
          value={text}
          onChange={e => change(e.target.value)}
          placeholder="등록된 시스템 기본 대본이 없습니다."
        />
      )}
    </div>
  )
}

const SECTIONS = [
  {
    title: '기본값관리 (환경설정 실제 메뉴와 동일 구성)',
    tabs: [
      { key: 'defaults', label: '기본값 관리' },
    ],
  },
  {
    title: '기준관리 (환경설정 실제 메뉴와 동일 구성)',
    tabs: [
      { key: 'threshold', label: '기준 관리' },
    ],
  },
  {
    title: 'R/P 스크립트 (환경설정 "RP스크립트관리"의 시스템값 19종)',
    tabs: [
      { key: 'rpscript', label: 'R/P 스크립트' },
    ],
  },
  {
    title: '시스템코드/참조 데이터 (환경설정에는 없음 — 계산엔진·입력폼 드롭다운용)',
    tabs: [
      { key: 'refcodes',  label: '시스템코드' },
      { key: 'pension_std', label: '국민연금 기준소득월액', table: 'planner_pension_std_incm_mn', pk: ['std_yr', 'sn'], columns: [
        { key: 'std_yr',       label: '기준연도',     type: 'text',   width: 90 },
        { key: 'sn',           label: '구간번호',     type: 'number', width: 80 },
        { key: 'mn_incm_ge',   label: '이상(원)',     type: 'number' },
        { key: 'mn_incm_lt',   label: '미만(원)',     type: 'number' },
        { key: 'std_incm_mn',  label: '기준소득월액', type: 'number' },
        { key: 'indi_pay_amt', label: '개인부담금',   type: 'number' },
        { key: 'wkr_pay_amt',  label: '사업장부담금', type: 'number' },
      ]},
      { key: 'pension_rev', label: '국민연금 재평가율', table: 'planner_pension_yr_revalue', pk: ['yr'], columns: [
        { key: 'yr',           label: '연도',    type: 'text',   width: 90 },
        { key: 'revalue_rate', label: '재평가율', type: 'number' },
      ]},
      { key: 'sysmisc', label: '기타 설정값' },
    ],
  },
]

export default function PlannerSeedEditor() {
  const [mainTab, setMainTab] = useState('defaults')
  // 탭 전환 시 미저장 경고(2026-09-04, SeedEditor.jsx handleTabChange와 동일) — 원래 이 화면엔
  // 이 가드가 아예 없어서, 저장 중/저장 직후 다른 탭을 클릭하면 편집 중이던 컴포넌트가 그대로
  // 통째로 unmount되어(경고 없이) 진행 중이던 저장 결과 안내(alert)까지 함께 사라질 수 있었다.
  const dirtyRef = useRef(false)
  const handleTabChange = (t) => {
    if (dirtyRef.current) {
      if (!window.confirm('저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?')) return
    }
    dirtyRef.current = false
    setMainTab(t)
  }
  return (
    <div>
      <h2 style={{ ...s.pageTitle, marginBottom: 4 }}>Seed 데이터 편집기 (Smart Planner+)</h2>
      <p style={s.desc}>
        Smart Planner+ 사용자 앱 환경설정 &gt; 기본값관리의 "시스템값"과, 화면에는 없지만
        계산엔진·입력폼이 쓰는 참조 데이터를 관리합니다. 설계사별 "사용자 정의" 재정의값은
        여기서 다루지 않습니다.
      </p>
      <div style={s.notice}>
        ✅ 사용자 앱 동기화 구현 완료(2026-08-15): 여기서 값을 저장하면 planner_seed_sync_meta가
        갱신되고, 사용자 앱은 Header의 "🔄 데이터 동기화" 버튼(seed:sync IPC, Smart HR+
        seedSync.js 대응물)으로 이 값을 내려받아 로컬 DB에 반영합니다(수동 트리거 — 로그인 시
        자동 동기화는 아직 없음). "기본값 관리"(생활수준/교육비/결혼자금/상승률)·"기준 관리"
        (재무비율/보장자산/저축기간)·"R/P 스크립트"(19종)·시스템코드 12개 그룹까지
        관리합니다(2026-11-19부터 기준관리 3종 + R/P 스크립트 추가 — 전부 "사용자별 재정의만
        있는 줄 알고 뺐었는데, 실제로는 전역 "시스템값" 레이어가 따로 있어 admin-portal에서
        채워 넣어야 하는 항목이었음. R/P 스크립트는 "사용자 정의" 부분만 설계사별 개인
        설정값이라 여전히 관리 대상 아님).
      </div>

      <div style={s.mainTabs}>
        {SECTIONS.map((sec, si) => (
          <div key={sec.title} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {si > 0 && <span style={s.tabDivider} />}
            {sec.tabs.map(t => (
              <button key={t.key} title={sec.title}
                style={{ ...s.mainTab, ...(mainTab === t.key ? s.mainTabActive : {}) }}
                onClick={() => handleTabChange(t.key)}>{t.label}</button>
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {mainTab === 'defaults'  && <DefaultsManagementGroup onDirtyChange={v => { dirtyRef.current = v }} />}
        {mainTab === 'threshold' && <ThresholdManagementGroup onDirtyChange={v => { dirtyRef.current = v }} />}
        {mainTab === 'rpscript'  && <RpScriptGroup onDirtyChange={v => { dirtyRef.current = v }} />}
        {mainTab === 'refcodes'  && <CodeNamesTab onDirtyChange={v => { dirtyRef.current = v }} />}
        {mainTab === 'sysmisc'   && <SysConfigMiscTab onDirtyChange={v => { dirtyRef.current = v }} />}
        {(mainTab === 'pension_std' || mainTab === 'pension_rev') && (() => {
          const cfg = SECTIONS[3].tabs.find(t => t.key === mainTab)
          return <SimpleTableTab key={cfg.table} table={cfg.table} pk={cfg.pk} columns={cfg.columns} onDirtyChange={v => { dirtyRef.current = v }} />
        })()}
      </div>
    </div>
  )
}

// ─── 시스템코드 탭 (planner_code_names, 복합키 cd_fld_nm+cd_val) ──────────────
function CodeNamesTab({ onDirtyChange }) {
  const [groupCode, setGroupCode] = useState(CODE_GROUPS[0].code)
  const [items, setItems]         = useState([])
  const [dirty, setDirty]         = useState(false)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState(null)
  const savingRef = useRef(false) // 저장 버튼 연타 방지(2026-09-04, SeedEditor.jsx CodeTab과 동일)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('planner_code_names').select('*')
      .eq('cd_fld_nm', groupCode)
      .order('cd_val', { ascending: true })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setItems((data || []).map(r => ({ ...r, _pk: { cd_fld_nm: r.cd_fld_nm, cd_val: r.cd_val } })))
    setDirty(false); setLoading(false)
  }, [groupCode])

  useEffect(() => { load() }, [load])

  const change = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val, _dirty: true } : it))
    setDirty(true)
  }

  const handleAdd = () => {
    setItems(prev => [...prev, { cd_fld_nm: groupCode, cd_val: '', cd_nm: '', _pk: null, _dirty: true }])
    setDirty(true)
  }

  const handleDelete = async (idx) => {
    const it = items[idx]
    if (it._pk) {
      if (!window.confirm('삭제하시겠습니까?')) return
      const { error } = await supabase.from('planner_code_names').delete().match(it._pk)
      if (error) { setMsg({ type: 'error', text: error.message }); return }
    }
    setItems(prev => prev.filter((_, i) => i !== idx))
    setDirty(true)
  }

  const handleSave = async () => {
    if (savingRef.current) return
    const toSave = items.filter(it => it._dirty)
    if (!toSave.length) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      for (const it of toSave) {
        const payload = {
          cd_fld_nm: groupCode,
          cd_val: (it.cd_val || '').trim(),
          cd_nm: (it.cd_nm || '').trim(),
          parent_cd_val: it.parent_cd_val || null,
          is_fixed: !!it.is_fixed,
          is_auto_link: !!it.is_auto_link,
          tooltip: it.tooltip || null,
          ratio_role: it.ratio_role || null,
        }
        if (!payload.cd_val || !payload.cd_nm) continue
        if (!it._pk) {
          const { error } = await supabase.from('planner_code_names').insert(payload)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        } else {
          const { error } = await supabase.from('planner_code_names').update(payload).match(it._pk)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        }
      }
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
      touchSyncMeta()
      load()
    } catch (e) {
      // supabase 호출이 에러 객체가 아니라 예외를 던지는 경우(네트워크 단절 등) — catch가
      // 없으면 setMsg가 아예 호출되지 않아 성공/실패 어느 안내도 안 뜨고 saving 상태만
      // 켜졌다 꺼지는 것처럼 보인다(2026-09-04 실제 재현 사례).
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      <div style={s.groupSidebar}>
        {CODE_GROUPS.map(g => (
          <button key={g.code}
            style={{ ...s.groupBtn, ...(groupCode === g.code ? s.groupBtnActive : {}) }}
            onClick={() => {
              if (dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?')) return
              setGroupCode(g.code)
            }}>
            {g.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={s.toolbar}>
          <span style={s.cnt}>
            총 <strong style={{ color: '#2563EB' }}>{items.length}</strong>건
            {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
            <button style={s.btn('success')} onClick={handleAdd} disabled={saving}>+ 행 추가</button>
            <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
              {saving ? '저장 중…' : '💾 저장'}
            </button>
          </div>
        </div>
        <MsgModal msg={msg} onClose={() => setMsg(null)} />
        {loading ? <div style={s.empty}>로딩 중…</div> : (() => {
          const hierarchical = HIERARCHICAL_GROUPS.has(groupCode)
          const parentOptions = items.filter(it => !it.parent_cd_val && it.cd_val)
          return (
          <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: 100 }}>코드값</th>
                <th style={{ ...s.th, width: 180 }}>코드명</th>
                {hierarchical && <th style={{ ...s.th, width: 120 }}>상위그룹</th>}
                {hierarchical && <th style={{ ...s.th, width: 56, textAlign: 'center' }}>고정</th>}
                {hierarchical && <th style={{ ...s.th, width: 56, textAlign: 'center' }}>연동</th>}
                {hierarchical && <th style={{ ...s.th, width: 170 }}>적정성지표 역할</th>}
                {hierarchical && <th style={s.th}>툴팁</th>}
                <th style={{ ...s.th, width: 56, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={hierarchical ? 8 : 3} style={s.empty}>등록된 데이터가 없습니다.</td></tr>
              ) : items.map((it, idx) => (
                <tr key={idx} style={{ background: it._dirty ? 'rgba(37,99,235,.03)' : 'transparent', borderBottom: '1px solid #F1F5F9' }}>
                  <td style={s.td}>
                    <input style={{ ...s.input, fontFamily: 'monospace' }} value={it.cd_val}
                      onChange={e => change(idx, 'cd_val', e.target.value)} placeholder="코드값" disabled={!!it._pk} />
                  </td>
                  <td style={s.td}>
                    <input style={s.input} value={it.cd_nm} onChange={e => change(idx, 'cd_nm', e.target.value)} placeholder="코드명" />
                  </td>
                  {hierarchical && (
                    <td style={s.td}>
                      <select style={s.input} value={it.parent_cd_val || ''} onChange={e => change(idx, 'parent_cd_val', e.target.value || null)}>
                        <option value="">(그룹 자체)</option>
                        {parentOptions.filter(p => p.cd_val !== it.cd_val).map(p => (
                          <option key={p.cd_val} value={p.cd_val}>{p.cd_val} {p.cd_nm}</option>
                        ))}
                      </select>
                    </td>
                  )}
                  {hierarchical && (
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <input type="checkbox" checked={!!it.is_fixed} onChange={e => change(idx, 'is_fixed', e.target.checked)} />
                    </td>
                  )}
                  {hierarchical && (
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <input type="checkbox" checked={!!it.is_auto_link} onChange={e => change(idx, 'is_auto_link', e.target.checked)} />
                    </td>
                  )}
                  {hierarchical && (
                    <td style={s.td}>
                      <select style={s.input} value={it.ratio_role || ''} onChange={e => change(idx, 'ratio_role', e.target.value || null)}>
                        {RATIO_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                  )}
                  {hierarchical && (
                    <td style={s.td}>
                      <input style={s.input} value={it.tooltip || ''} onChange={e => change(idx, 'tooltip', e.target.value)} placeholder="(선택) 설명" />
                    </td>
                  )}
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <button style={s.btnDel} onClick={() => handleDelete(idx)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          )
        })()}
      </div>
    </div>
  )
}

// row(단순 {key,table,unit} 또는 pair {fields:[{key,table,unit,prefix,suffix}, ...]})를
// 실제 DB 필드 단위({key,table,unit})로 펼친다 — 저장 로직은 항상 이 평면 목록만 본다.
function flattenRow(row) {
  if (row.type === 'pair') return row.fields.map(f => ({ key: f.key, table: f.table, unit: f.unit }))
  return [{ key: row.key, table: row.table, unit: row.unit }]
}

// ─── 필드=행, 단계=열 편집기 (은퇴/결혼 공용 — 실제 화면의 "시스템값" 레이아웃) ──
// "여행/외식/골프"처럼 횟수+회당비용을 한 셀에 같이 보여줘야 하는 행은 type:'pair'로 표시.
function TieredFieldsTab({ tiers, rows, tables, onDirtyChange }) {
  const [values, setValues]   = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [msg, setMsg]         = useState(null)
  const savingRef = useRef(false) // 저장 버튼 연타 방지(2026-09-04, SeedEditor.jsx CodeTab과 동일)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const tableEntries = Object.entries(tables)
  const flatFields = rows.flatMap(flattenRow)

  const load = useCallback(async () => {
    setLoading(true)
    const results = await Promise.all(tableEntries.map(([, t]) => supabase.from(t.name).select('*')))
    const errored = results.find(r => r.error)
    if (errored) { setMsg({ type: 'error', text: errored.error.message }); setLoading(false); return }
    const next = {}
    for (const t of tiers) next[t.key] = {}
    tableEntries.forEach(([, t], i) => {
      for (const row of results[i].data || []) {
        if (next[row[t.pk]]) Object.assign(next[row[t.pk]], row)
      }
    })
    setValues(next); setDirty(false); setLoading(false)
  }, [tables])

  useEffect(() => { load() }, [load])

  const displayVal = (tierKey, key, unit) => {
    const raw = values[tierKey]?.[key]
    if (raw === undefined || raw === null || raw === '') return ''
    return unit === 'money' ? Number(raw) / 10000 : raw
  }

  const change = (tierKey, key, unit, inputVal) => {
    const num = inputVal === '' ? '' : Number(inputVal)
    const raw = unit === 'money' ? (num === '' ? '' : num * 10000) : num
    setValues(prev => ({ ...prev, [tierKey]: { ...prev[tierKey], [key]: raw } }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      const upserts = []
      for (const t of tiers) {
        const v = values[t.key] || {}
        for (const [tableKey, tinfo] of tableEntries) {
          const payload = { [tinfo.pk]: t.key }
          let any = false
          for (const f of flatFields.filter(fl => fl.table === tableKey)) {
            payload[f.key] = Number(v[f.key] || 0)
            any = true
          }
          if (!any) continue
          upserts.push(supabase.from(tinfo.name).upsert(payload, { onConflict: tinfo.pk }))
        }
      }
      const results = await Promise.all(upserts)
      const errored = results.find(r => r.error)
      if (errored) { setMsg({ type: 'error', text: errored.error.message }); return }
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
      touchSyncMeta()
      load()
    } catch (e) {
      // supabase 호출이 에러 객체가 아니라 예외를 던지는 경우(네트워크 단절 등) — catch가
      // 없으면 setMsg가 아예 호출되지 않아 성공/실패 어느 안내도 안 뜨고 saving 상태만
      // 켜졌다 꺼지는 것처럼 보인다(2026-09-04 실제 재현 사례).
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>시스템값 {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: 200 }}>항목</th>
                {tiers.map(t => <th key={t.key} style={s.th}>{t.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.type === 'pair' ? row.fields[0].key : row.key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{row.label}</td>
                  {row.type === 'pair' ? tiers.map(t => (
                    <td key={t.key} style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--tx3, #64748B)' }}>
                        {row.fields.map((f) => (
                          <Fragment key={f.key}>
                            {f.prefix && <span>{f.prefix}</span>}
                            <input
                              style={{ ...s.input, width: f.unit === 'money' ? 64 : 44, display: 'inline-block' }}
                              type="text" inputMode={f.unit === 'money' ? 'decimal' : 'numeric'}
                              value={displayVal(t.key, f.key, f.unit)}
                              onChange={e => change(t.key, f.key, f.unit, e.target.value)}
                            />
                            {f.suffix && <span>{f.suffix}</span>}
                          </Fragment>
                        ))}
                      </span>
                    </td>
                  )) : tiers.map(t => (
                    <td key={t.key} style={s.td}>
                      <input style={s.input} type="text" inputMode="decimal" value={displayVal(t.key, row.key, row.unit)}
                        onChange={e => change(t.key, row.key, row.unit, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── 단일 행(싱글톤) 필드 편집기 — 보장자산/저축기간처럼 등급 구분 없는 전역 설정값 ───
// (2026-11-19 신설) planner_protect_asset_threshold_defaults/planner_savings_term_defaults
// 둘 다 id=1 고정 싱글톤 PK라(supabase_planner_threshold_defaults.sql 참고) 항상 그 한 행만
// upsert한다. money:true인 필드는 화면엔 만원으로 보여주고 저장 시 원으로 환산한다
// (EduDefaultsTab과 동일 패턴).
function SingletonFieldsTab({ table, rows, onDirtyChange }) {
  const [values, setValues]   = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [msg, setMsg]         = useState(null)
  const savingRef = useRef(false)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from(table).select('*').eq('id', 1).maybeSingle()
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setValues(data || {}); setDirty(false); setLoading(false)
  }, [table])

  useEffect(() => { load() }, [load])

  // 금액(money:true) 필드는 천단위 콤마를 찍어 보여준다(2026-11-19 사용자 지시 —
  // "보장자산 메뉴에서 금액 입력에는 콤마 찍어줘"). 입력 중엔 콤마를 지우고 숫자만
  // 파싱해서 저장하고, 보여줄 때만 다시 콤마를 붙인다.
  const displayVal = (row) => {
    const raw = values[row.key]
    if (raw === undefined || raw === null || raw === '') return ''
    const v = row.money ? Number(raw) / 10000 : raw
    return row.money ? Number(v).toLocaleString('ko-KR') : v
  }

  const change = (row, inputVal) => {
    const cleaned = inputVal.replace(/,/g, '')
    const num = cleaned === '' ? '' : Number(cleaned)
    if (num !== '' && Number.isNaN(num)) return
    const raw = row.money ? (num === '' ? '' : num * 10000) : num
    setValues(prev => ({ ...prev, [row.key]: raw }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      const payload = { id: 1 }
      for (const row of rows) payload[row.key] = values[row.key] === '' || values[row.key] == null ? null : Number(values[row.key])
      const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' })
      if (error) { setMsg({ type: 'error', text: error.message }); return }
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
      touchSyncMeta()
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>시스템값 {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <table style={{ ...s.table, maxWidth: 420 }}>
          <thead><tr><th style={s.th}>항목</th><th style={{ ...s.th, width: 160 }}>값</th></tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={s.td}>{row.label}</td>
                <td style={s.td}>
                  <input style={s.input} type="text" inputMode="decimal" value={displayVal(row)}
                    onChange={e => change(row, e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// 비율의 상한/하한 2값 + 방향으로 주의/보통/양호 3단계 표시 텍스트를 계산한다(사용자 앱
// RatioThresholdTable.jsx의 tierTexts()와 완전히 동일한 로직 — 두 레포에서 같은 결과가
// 나오도록 유지해야 한다).
function ratioTierTexts(direction, lower, upper) {
  const hasLower = lower !== '' && lower != null
  const hasUpper = upper !== '' && upper != null
  const range = hasLower && hasUpper ? `${lower}% 이상 ~ ${upper}% 미만` : '—'
  if (direction === 'lowerBetter') {
    return { caution: hasUpper ? `${upper}% 이상` : '—', normal: range, good: hasLower ? `${lower}% 미만` : '—' }
  }
  return { caution: hasLower ? `${lower}% 미만` : '—', normal: range, good: hasUpper ? `${upper}% 이상` : '—' }
}

// ─── 재무비율 적정성 기준 편집기(기준관리 > 재무비율) ─────────────────────────
// planner_ratio_threshold_defaults(id=1 싱글톤)에서 비율별 상한/하한 10개 컬럼을 읽고,
// 사용자 앱과 동일하게 "구분|기준|주의|보통(입력 2칸)|양호" 구조로 보여준다. 여기선
// "시스템값"만 다루므로(사용자별 "사용자 정의"는 사용자 앱에만 있음) 시스템값/사용자정의
// 2단 그룹 헤더 없이 한 벌만 그린다.
function RatioRangeTab({ onDirtyChange }) {
  const table = 'planner_ratio_threshold_defaults'
  const [values, setValues]   = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [msg, setMsg]         = useState(null)
  const savingRef = useRef(false)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from(table).select('*').eq('id', 1).maybeSingle()
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setValues(data || {}); setDirty(false); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const change = (col, inputVal) => {
    setValues(prev => ({ ...prev, [col]: inputVal === '' ? '' : Number(inputVal) }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (savingRef.current) return
    for (const r of RATIO_RANGES) {
      const lower = values[r.lowerCol], upper = values[r.upperCol]
      const hasLower = lower !== '' && lower != null, hasUpper = upper !== '' && upper != null
      if (hasLower !== hasUpper) { setMsg({ type: 'error', text: `${r.label} — 상한/하한 값을 모두 입력하거나 모두 비워두세요.` }); return }
      if (hasLower && hasUpper && Number(upper) <= Number(lower)) { setMsg({ type: 'error', text: `${r.label} — 상한 값은 하한 값보다 커야 합니다.` }); return }
    }
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      const payload = { id: 1 }
      for (const r of RATIO_RANGES) {
        payload[r.lowerCol] = values[r.lowerCol] === '' || values[r.lowerCol] == null ? null : Number(values[r.lowerCol])
        payload[r.upperCol] = values[r.upperCol] === '' || values[r.upperCol] == null ? null : Number(values[r.upperCol])
      }
      const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' })
      if (error) { setMsg({ type: 'error', text: error.message }); return }
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
      touchSyncMeta()
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>시스템값 {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>구분</th>
              <th style={s.th}>기준</th>
              <th style={s.th}>주의</th>
              <th style={{ ...s.th, width: 200 }}>보통</th>
              <th style={s.th}>양호</th>
            </tr>
          </thead>
          <tbody>
            {RATIO_RANGES.map(r => {
              const lower = values[r.lowerCol] ?? '', upper = values[r.upperCol] ?? ''
              const text = ratioTierTexts(r.direction, lower, upper)
              return (
                <tr key={r.key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={s.td}>{r.label}</td>
                  <td style={{ ...s.td, color: '#64748B', fontSize: 12 }}>{r.criterion}</td>
                  <td style={s.td}>{text.caution}</td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                      <input style={{ ...s.input, width: 64, border: '1.5px solid #CBD5E1' }} type="text" inputMode="decimal" value={upper} onChange={e => change(r.upperCol, e.target.value)} />
                      <span style={{ fontSize: 12, color: '#64748B' }}>%미만</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <input style={{ ...s.input, width: 64, border: '1.5px solid #CBD5E1' }} type="text" inputMode="decimal" value={lower} onChange={e => change(r.lowerCol, e.target.value)} />
                      <span style={{ fontSize: 12, color: '#64748B' }}>%이상</span>
                    </div>
                  </td>
                  <td style={s.td}>{text.good}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── 저축기간구분 경계값 편집기(기준관리 > 저축기간) ───────────────────────────
// planner_savings_term_defaults(id=1 싱글톤, sav_mid_trm_lower_bnd/upper_bnd)에서 2값을
// 읽고, 사용자 앱과 동일하게 "단기/중기/장기" 3행으로 보여준다. 입력창은 "중기" 행에만
// 둔다(사용자 앱 SavTermRangeTable.jsx와 동일 레이아웃).
function SavTermRangeTab({ onDirtyChange }) {
  const table = 'planner_savings_term_defaults'
  const LOWER = 'sav_mid_trm_lower_bnd', UPPER = 'sav_mid_trm_upper_bnd'
  const [values, setValues]   = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [msg, setMsg]         = useState(null)
  const savingRef = useRef(false)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from(table).select('*').eq('id', 1).maybeSingle()
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setValues(data || {}); setDirty(false); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const change = (col, inputVal) => {
    setValues(prev => ({ ...prev, [col]: inputVal === '' ? '' : Number(inputVal) }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (savingRef.current) return
    const lower = values[LOWER], upper = values[UPPER]
    const hasLower = lower !== '' && lower != null, hasUpper = upper !== '' && upper != null
    if (hasLower !== hasUpper) { setMsg({ type: 'error', text: '단기/중기 경계와 중기/장기 경계 값을 모두 입력하거나 모두 비워두세요.' }); return }
    if (hasLower && hasUpper && Number(upper) <= Number(lower)) { setMsg({ type: 'error', text: '중기/장기 경계 값은 단기/중기 경계 값보다 커야 합니다.' }); return }
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      const payload = {
        id: 1,
        [LOWER]: lower === '' || lower == null ? null : Number(lower),
        [UPPER]: upper === '' || upper == null ? null : Number(upper),
      }
      const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' })
      if (error) { setMsg({ type: 'error', text: error.message }); return }
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
      touchSyncMeta()
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const lower = values[LOWER] ?? '', upper = values[UPPER] ?? ''

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>시스템값 {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <table style={{ ...s.table, maxWidth: 420 }}>
          <thead><tr><th style={s.th}>구분</th><th style={{ ...s.th, width: 220 }}>값</th></tr></thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
              <td style={s.td}>단기</td>
              <td style={s.td}>{lower !== '' ? `${lower}년 미만` : '—'}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
              <td style={s.td}>중기</td>
              <td style={s.td}>
                {/* 2026-11-19 사용자 지시 — 가로 한 줄에 입력 2개를 몰아넣으니 좁은 열
                    너비에서 두 번째 입력이 줄바꿈되며 눈에 안 띄는 문제가 있었다(s.input의
                    기본 border가 투명이라 더 그랬음). RatioRangeTab의 "보통" 칸과 동일하게
                    입력칸마다 줄을 나누고 테두리를 명시적으로 보이게 했다. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                  <input style={{ ...s.input, width: 64, border: '1.5px solid #CBD5E1' }} type="text" inputMode="decimal" value={lower} onChange={e => change(LOWER, e.target.value)} />
                  <span style={{ fontSize: 12, color: '#64748B' }}>년 이상</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <input style={{ ...s.input, width: 64, border: '1.5px solid #CBD5E1' }} type="text" inputMode="decimal" value={upper} onChange={e => change(UPPER, e.target.value)} />
                  <span style={{ fontSize: 12, color: '#64748B' }}>년 미만</span>
                </div>
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
              <td style={s.td}>장기</td>
              <td style={s.td}>{upper !== '' ? `${upper}년 이상` : '—'}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── 교육 탭 (edu_level_defaults, 고정 14개 코드 × 값 1개) ─────────────────────
function EduDefaultsTab({ onDirtyChange }) {
  const [values, setValues]   = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [msg, setMsg]         = useState(null)
  const savingRef = useRef(false) // 저장 버튼 연타 방지(2026-09-04, SeedEditor.jsx CodeTab과 동일)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('planner_edu_level_defaults').select('*')
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    const next = {}
    for (const row of data || []) next[row.edu_lvl_tp] = row.req_amt
    setValues(next); setDirty(false); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const change = (code, inputVal) => {
    setValues(prev => ({ ...prev, [code]: inputVal === '' ? '' : Number(inputVal) * 10000 }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      for (const row of EDU_ROWS) {
        const { error } = await supabase.from('planner_edu_level_defaults')
          .upsert({ edu_lvl_tp: row.code, req_amt: Number(values[row.code] || 0) }, { onConflict: 'edu_lvl_tp' })
        if (error) { setMsg({ type: 'error', text: error.message }); return }
      }
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
      touchSyncMeta()
      load()
    } catch (e) {
      // supabase 호출이 에러 객체가 아니라 예외를 던지는 경우(네트워크 단절 등) — catch가
      // 없으면 setMsg가 아예 호출되지 않아 성공/실패 어느 안내도 안 뜨고 saving 상태만
      // 켜졌다 꺼지는 것처럼 보인다(2026-09-04 실제 재현 사례).
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>시스템값 {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <table style={{ ...s.table, maxWidth: 420 }}>
          <thead>
            <tr>
              <th style={s.th}>교육단계</th>
              <th style={{ ...s.th, width: 160 }}>필요금액(만원)</th>
            </tr>
          </thead>
          <tbody>
            {EDU_ROWS.map(row => (
              <tr key={row.code} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={s.td}>{row.label}</td>
                <td style={s.td}>
                  <input style={s.input} type="text" inputMode="decimal"
                    value={values[row.code] !== undefined && values[row.code] !== '' ? Number(values[row.code]) / 10000 : ''}
                    onChange={e => change(row.code, e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── 상승률 탭 (planner_system_config, 고정 키 3개) ────────────────────────────
function RateDefaultsTab({ onDirtyChange }) {
  const [values, setValues]   = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [msg, setMsg]         = useState(null)
  const savingRef = useRef(false) // 저장 버튼 연타 방지(2026-09-04, SeedEditor.jsx CodeTab과 동일)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('planner_system_config')
      .select('*').in('key', RATE_ROWS.map(r => r.key))
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    const next = {}
    for (const row of data || []) next[row.key] = row.value
    setValues(next); setDirty(false); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      for (const row of RATE_ROWS) {
        const { error } = await supabase.from('planner_system_config').upsert({
          key: row.key,
          value: (values[row.key] ?? '').toString(),
          description: row.label,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })
        if (error) { setMsg({ type: 'error', text: error.message }); return }
      }
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
      touchSyncMeta()
      load()
    } catch (e) {
      // supabase 호출이 에러 객체가 아니라 예외를 던지는 경우(네트워크 단절 등) — catch가
      // 없으면 setMsg가 아예 호출되지 않아 성공/실패 어느 안내도 안 뜨고 saving 상태만
      // 켜졌다 꺼지는 것처럼 보인다(2026-09-04 실제 재현 사례).
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>시스템값 {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <table style={{ ...s.table, maxWidth: 420 }}>
          <thead>
            <tr><th style={s.th}>항목</th><th style={{ ...s.th, width: 140 }}>값</th></tr>
          </thead>
          <tbody>
            {RATE_ROWS.map(row => (
              <tr key={row.key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={s.td}>{row.label}</td>
                <td style={s.td}>
                  <input style={s.input} type="text" inputMode="decimal" value={values[row.key] ?? ''}
                    onChange={e => { setValues(prev => ({ ...prev, [row.key]: e.target.value })); setDirty(true) }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── 기타 설정값 탭 (planner_system_config 중 "상승률" 3개 키를 제외한 나머지) ──
function SysConfigMiscTab({ onDirtyChange }) {
  const excludeKeys = RATE_ROWS.map(r => r.key)
  return (
    <>
      <div style={{ ...s.notice, marginBottom: 12 }}>
        예상인플레이션율 등 3개 키는 위 "상승률" 탭에서 관리합니다. 여기서는 그 외
        시스템 설정값(예: 국민연금 3년 평균소득월액 등)만 다룹니다.
      </div>
      <SimpleTableTab
        table="planner_system_config"
        pk={['key']}
        columns={[
          { key: 'key',         label: '키',   type: 'text', width: 280 },
          { key: 'value',       label: '값',   type: 'text', width: 160 },
          { key: 'description', label: '설명', type: 'text' },
        ]}
        excludeFilter={q => q.not('key', 'in', `(${excludeKeys.join(',')})`)}
        onDirtyChange={onDirtyChange}
      />
    </>
  )
}

// ─── 자연키 기반 공용 편집기(코드/값 나열형 테이블) ────────────────────────────
function SimpleTableTab({ table, pk, columns, excludeFilter, onDirtyChange }) {
  const [items, setItems]     = useState([])
  const [dirty, setDirty]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)
  const savingRef = useRef(false) // 저장 버튼 연타 방지(2026-09-04, SeedEditor.jsx CodeTab과 동일)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from(table).select('*')
    if (excludeFilter) q = excludeFilter(q)
    const { data, error } = await q
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setItems((data || []).map(r => ({ ...r, _pk: Object.fromEntries(pk.map(k => [k, r[k]])) })))
    setDirty(false); setLoading(false)
  }, [table, pk, excludeFilter])

  useEffect(() => { load() }, [load])

  const change = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val, _dirty: true } : it))
    setDirty(true)
  }

  const handleAdd = () => {
    const blank = Object.fromEntries(columns.map(c => [c.key, c.type === 'number' ? 0 : '']))
    setItems(prev => [...prev, { ...blank, _pk: null, _dirty: true }])
    setDirty(true)
  }

  const handleDelete = async (idx) => {
    const it = items[idx]
    if (it._pk) {
      if (!window.confirm('삭제하시겠습니까?')) return
      const { error } = await supabase.from(table).delete().match(it._pk)
      if (error) { setMsg({ type: 'error', text: error.message }); return }
    }
    setItems(prev => prev.filter((_, i) => i !== idx))
    setDirty(true)
  }

  const handleSave = async () => {
    if (savingRef.current) return
    const toSave = items.filter(it => it._dirty)
    if (!toSave.length) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      for (const it of toSave) {
        const payload = Object.fromEntries(columns.map(c => [
          c.key,
          c.type === 'number' ? Number(it[c.key] || 0) : (it[c.key] ?? '').toString(),
        ]))
        if (!it._pk) {
          const { error } = await supabase.from(table).insert(payload)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        } else {
          const { error } = await supabase.from(table).update(payload).match(it._pk)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        }
      }
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
      touchSyncMeta()
      load()
    } catch (e) {
      // supabase 호출이 에러 객체가 아니라 예외를 던지는 경우(네트워크 단절 등) — catch가
      // 없으면 setMsg가 아예 호출되지 않아 성공/실패 어느 안내도 안 뜨고 saving 상태만
      // 켜졌다 꺼지는 것처럼 보인다(2026-09-04 실제 재현 사례).
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>
          총 <strong style={{ color: '#2563EB' }}>{items.length}</strong>건
          {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('success')} onClick={handleAdd} disabled={saving}>+ 행 추가</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                {columns.map(c => <th key={c.key} style={{ ...s.th, width: c.width }}>{c.label}</th>)}
                <th style={{ ...s.th, width: 56, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={columns.length + 1} style={s.empty}>등록된 데이터가 없습니다.</td></tr>
              ) : items.map((it, idx) => (
                <tr key={idx} style={{ background: it._dirty ? 'rgba(37,99,235,.03)' : 'transparent', borderBottom: '1px solid #F1F5F9' }}>
                  {columns.map(c => (
                    <td key={c.key} style={s.td}>
                      <input
                        style={s.input}
                        type="text"
                        inputMode={c.type === 'number' ? 'decimal' : 'text'}
                        value={it[c.key] ?? ''}
                        onChange={e => change(idx, c.key, e.target.value)}
                        disabled={!!it._pk && pk.includes(c.key)}
                      />
                    </td>
                  ))}
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <button style={s.btnDel} onClick={() => handleDelete(idx)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const s = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: '#1E293B' },
  desc:      { fontSize: 13, color: '#94A3B8', marginBottom: 14, lineHeight: 1.6 },
  notice: {
    marginBottom: 18, padding: '10px 14px', background: '#FFFBEB',
    border: '1px solid #FDE68A', borderRadius: 8,
    fontSize: 12, color: '#92400E', lineHeight: 1.6,
  },
  mainTabs: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, flexWrap: 'wrap', borderBottom: '1px solid #E2E8F0' },
  tabDivider: { width: 1, height: 20, background: '#E2E8F0', margin: '0 8px' },
  mainTab:  {
    padding: '9px 16px', border: 'none', background: 'transparent',
    fontSize: 13.5, fontWeight: 600, cursor: 'pointer', color: '#64748B',
    borderBottom: '2px solid transparent', fontFamily: 'inherit',
    transition: 'color .15s', whiteSpace: 'nowrap',
  },
  mainTabActive: { color: '#0D9488', borderBottom: '2px solid #0D9488' },

  // 너비(2026-11-19 사용자 지시 — "하위 메뉴명이 두줄로 표시되지 않도록 늘리고 ... 모든
  // 탭의 하위메뉴 너비를 거기에 맞게 통일해줘") — 가장 긴 라벨인 R/P 스크립트의
  // "상세설계 : 재무목표별 자산분석/설계"(20자)가 13px 폰트에서 한 줄에 들어가는 폭으로
  // 맞췄다. groupSidebar/groupBtn은 SubmenuGroup(기본값관리/기준관리/R·P스크립트)과
  // CodeNamesTab(시스템코드) 전부가 공유하는 단일 스타일이라, 여기 하나만 바꾸면 모든
  // 탭의 하위메뉴 너비가 자동으로 통일된다.
  groupSidebar: {
    width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2,
    borderRight: '1px solid #E2E8F0', paddingRight: 12, marginRight: 16,
  },
  groupBtn: {
    padding: '8px 12px', border: 'none', borderRadius: 8,
    background: 'transparent', fontSize: 13, cursor: 'pointer', color: '#475569',
    textAlign: 'left', fontFamily: 'inherit', fontWeight: 500,
    transition: 'all .12s', whiteSpace: 'nowrap',
  },
  groupBtnActive: { background: '#F0FDFA', boxShadow: 'inset 0 0 0 1.5px #5EEAD4', color: '#0D9488', fontWeight: 700 },

  card: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.06)' },

  toolbar: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, justifyContent: 'space-between' },
  cnt:  { fontSize: 13, color: '#475569' },
  btn: (v) => ({
    padding: '7px 14px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
    ...(v === 'primary' ? { background: '#0D9488', color: '#fff' } :
        v === 'success' ? { background: '#16A34A', color: '#fff' } :
                          { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }),
  }),

  alert: { padding: '8px 14px', borderRadius: 8, fontSize: 13, marginBottom: 10 },
  alertOk:    { background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D' },
  alertError: { background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' },
  alertClose: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', color: 'inherit', opacity: 0.5, flexShrink: 0 },

  table: { width: '100%', borderCollapse: 'collapse', background: '#fff' },
  th: {
    padding: '9px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: '#64748B', borderBottom: '2px solid #E2E8F0', whiteSpace: 'nowrap',
    background: '#FAFBFC',
  },
  td: { padding: '8px 10px', fontSize: 13, color: '#1E293B', verticalAlign: 'middle' },
  empty: { textAlign: 'center', padding: '36px 0', color: '#94A3B8', fontSize: 13 },

  input: {
    padding: '5px 8px', border: '1.5px solid transparent', borderRadius: 6,
    fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%',
    background: '#F8FAFC', transition: 'border-color .15s',
  },

  btnDel: {
    padding: '4px 10px', background: '#EF4444', color: '#fff',
    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
}
