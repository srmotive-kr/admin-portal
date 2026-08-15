import { useEffect, useState, useCallback, Fragment } from 'react'
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

// ─── 기본값관리 > 은퇴 ─────────────────────────────────────────────────────────
// 실제 화면(RetireDefaultsTable.jsx)은 retire_preset_defaults(14개 필드)와
// ret_level_defaults(외식/골프/여행 회당비용 3개 필드)를 한 표로 합쳐서 보여준다.
const RETIRE_TIERS = [
  { key: '1', label: '기본적인생활' },
  { key: '2', label: '표준적인생활' },
  { key: '3', label: '여유로운생활' },
  { key: '4', label: '풍족한생활' },
]
const RETIRE_ROWS = [
  { key: 'req_bas_mn_amt',     label: '기초생활비(만원/월)',  table: 'retire', unit: 'money' },
  { key: 'req_med_mn_amt',     label: '의료비(만원/월)',      table: 'retire', unit: 'money' },
  // 두 필드를 한 셀에 같이 보여주는 행(2026-08-15 사용자 지시) — 여행/외식/골프는 횟수+
  // 회당비용("년/월 [ ]회, 회당 [ ]만원"), 연령 2종은 남/여("남 [ ]세, 여 [ ]세").
  { type: 'pair', label: '여행', fields: [
    { key: 'req_trvl_yr_cnt', table: 'retire', unit: 'raw', prefix: '년', suffix: '회, 회당' },
    { key: 'trvl_mn_cnt_xpns', table: 'retlvl', unit: 'money', suffix: '만원' },
  ]},
  { type: 'pair', label: '외식', fields: [
    { key: 'req_dine_mn_cnt', table: 'retire', unit: 'raw', prefix: '월', suffix: '회, 회당' },
    { key: 'dine_mn_cnt_xpns', table: 'retlvl', unit: 'money', suffix: '만원' },
  ]},
  { type: 'pair', label: '골프', fields: [
    { key: 'req_golf_mn_cnt', table: 'retire', unit: 'raw', prefix: '년', suffix: '회, 회당' },
    { key: 'golf_mn_cnt_xpns', table: 'retlvl', unit: 'money', suffix: '만원' },
  ]},
  { key: 'req_cult_mn_amt',    label: '문화비(만원/월)',      table: 'retire', unit: 'money' },
  { key: 'req_slv_twn_amt',    label: '실버타운보증금(만원)', table: 'retire', unit: 'money' },
  { key: 'req_alon_liv_rt',    label: '홀로생존시생활비율(%)', table: 'retire', unit: 'raw' },
  { key: 'req_med_rcu_trm',    label: '사망전 간병기간(년)',  table: 'retire', unit: 'raw' },
  { key: 'req_med_rcu_mn_amt', label: '간병비(만원/월)',      table: 'retire', unit: 'money' },
  { type: 'pair', label: '은퇴예상연령', fields: [
    { key: 'man_ret_age', table: 'retire', unit: 'raw', prefix: '남', suffix: '세,' },
    { key: 'fem_ret_age', table: 'retire', unit: 'raw', prefix: '여', suffix: '세' },
  ]},
  { type: 'pair', label: '기대수명', fields: [
    { key: 'man_dth_age', table: 'retire', unit: 'raw', prefix: '남', suffix: '세,' },
    { key: 'fem_dth_age', table: 'retire', unit: 'raw', prefix: '여', suffix: '세' },
  ]},
]
const RETIRE_TABLES = {
  retire: { name: 'planner_retire_preset_defaults', pk: 'ret_lvl_tp' },
  retlvl: { name: 'planner_ret_level_defaults',      pk: 'ret_lvl_tp' },
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

const SECTIONS = [
  {
    title: '기본값관리 (환경설정 실제 메뉴와 동일 구성)',
    tabs: [
      { key: 'retire', label: '은퇴' },
      { key: 'edu',    label: '교육' },
      { key: 'wed',    label: '결혼' },
      { key: 'rate',   label: '상승률' },
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
  const [mainTab, setMainTab] = useState('retire')
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
        자동 동기화는 아직 없음). 기본값관리 4개 탭(은퇴/교육/결혼/상승률)·시스템코드 11개
        그룹은 로컬 앱의 최신 패치 값으로 이관 완료. 환경설정의 나머지 3개 메뉴(코드관리/
        적정성기준/RP스크립트관리)는 설계사별 개인 설정값이라 관리 대상에서 제외했습니다.
      </div>

      <div style={s.mainTabs}>
        {SECTIONS.map((sec, si) => (
          <div key={sec.title} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {si > 0 && <span style={s.tabDivider} />}
            {sec.tabs.map(t => (
              <button key={t.key} title={sec.title}
                style={{ ...s.mainTab, ...(mainTab === t.key ? s.mainTabActive : {}) }}
                onClick={() => setMainTab(t.key)}>{t.label}</button>
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {mainTab === 'retire'   && <TieredFieldsTab tiers={RETIRE_TIERS} rows={RETIRE_ROWS} tables={RETIRE_TABLES} />}
        {mainTab === 'wed'      && <TieredFieldsTab tiers={WED_TIERS}    rows={WED_ROWS}    tables={WED_TABLES} />}
        {mainTab === 'edu'      && <EduDefaultsTab />}
        {mainTab === 'rate'     && <RateDefaultsTab />}
        {mainTab === 'refcodes' && <CodeNamesTab />}
        {mainTab === 'sysmisc'  && <SysConfigMiscTab />}
        {(mainTab === 'pension_std' || mainTab === 'pension_rev') && (() => {
          const cfg = SECTIONS[1].tabs.find(t => t.key === mainTab)
          return <SimpleTableTab key={cfg.table} table={cfg.table} pk={cfg.pk} columns={cfg.columns} />
        })()}
      </div>
    </div>
  )
}

// ─── 시스템코드 탭 (planner_code_names, 복합키 cd_fld_nm+cd_val) ──────────────
function CodeNamesTab() {
  const [groupCode, setGroupCode] = useState(CODE_GROUPS[0].code)
  const [items, setItems]         = useState([])
  const [dirty, setDirty]         = useState(false)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setMsg(null)
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
    const toSave = items.filter(it => it._dirty)
    if (!toSave.length) return
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
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      } else {
        const { error } = await supabase.from('planner_code_names').update(payload).match(it._pk)
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      }
    }
    setMsg({ type: 'success', text: '저장 완료' })
    touchSyncMeta()
    setSaving(false)
    load()
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
        {msg && (
          <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} style={s.alertClose}>×</button>
          </div>
        )}
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
function TieredFieldsTab({ tiers, rows, tables }) {
  const [values, setValues]   = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [msg, setMsg]         = useState(null)

  const tableEntries = Object.entries(tables)
  const flatFields = rows.flatMap(flattenRow)

  const load = useCallback(async () => {
    setLoading(true); setMsg(null)
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
    setSaving(true); setMsg(null)
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
        const { error } = await supabase.from(tinfo.name).upsert(payload, { onConflict: tinfo.pk })
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      }
    }
    setMsg({ type: 'success', text: '저장 완료' })
    touchSyncMeta()
    setSaving(false)
    load()
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
      {msg && (
        <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={s.alertClose}>×</button>
        </div>
      )}
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

// ─── 교육 탭 (edu_level_defaults, 고정 14개 코드 × 값 1개) ─────────────────────
function EduDefaultsTab() {
  const [values, setValues]   = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [msg, setMsg]         = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setMsg(null)
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
    setSaving(true); setMsg(null)
    for (const row of EDU_ROWS) {
      const { error } = await supabase.from('planner_edu_level_defaults')
        .upsert({ edu_lvl_tp: row.code, req_amt: Number(values[row.code] || 0) }, { onConflict: 'edu_lvl_tp' })
      if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
    }
    setMsg({ type: 'success', text: '저장 완료' })
    touchSyncMeta()
    setSaving(false)
    load()
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
      {msg && (
        <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={s.alertClose}>×</button>
        </div>
      )}
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
function RateDefaultsTab() {
  const [values, setValues]   = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [msg, setMsg]         = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setMsg(null)
    const { data, error } = await supabase.from('planner_system_config')
      .select('*').in('key', RATE_ROWS.map(r => r.key))
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    const next = {}
    for (const row of data || []) next[row.key] = row.value
    setValues(next); setDirty(false); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true); setMsg(null)
    for (const row of RATE_ROWS) {
      const { error } = await supabase.from('planner_system_config').upsert({
        key: row.key,
        value: (values[row.key] ?? '').toString(),
        description: row.label,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
    }
    setMsg({ type: 'success', text: '저장 완료' })
    touchSyncMeta()
    setSaving(false)
    load()
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
      {msg && (
        <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={s.alertClose}>×</button>
        </div>
      )}
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
function SysConfigMiscTab() {
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
      />
    </>
  )
}

// ─── 자연키 기반 공용 편집기(코드/값 나열형 테이블) ────────────────────────────
function SimpleTableTab({ table, pk, columns, excludeFilter }) {
  const [items, setItems]     = useState([])
  const [dirty, setDirty]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setMsg(null)
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
    const toSave = items.filter(it => it._dirty)
    if (!toSave.length) return
    setSaving(true); setMsg(null)
    for (const it of toSave) {
      const payload = Object.fromEntries(columns.map(c => [
        c.key,
        c.type === 'number' ? Number(it[c.key] || 0) : (it[c.key] ?? '').toString(),
      ]))
      if (!it._pk) {
        const { error } = await supabase.from(table).insert(payload)
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      } else {
        const { error } = await supabase.from(table).update(payload).match(it._pk)
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      }
    }
    setMsg({ type: 'success', text: '저장 완료' })
    touchSyncMeta()
    setSaving(false)
    load()
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
      {msg && (
        <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={s.alertClose}>×</button>
        </div>
      )}
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

  groupSidebar: {
    width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2,
    borderRight: '1px solid #E2E8F0', paddingRight: 12, marginRight: 16,
  },
  groupBtn: {
    padding: '8px 12px', border: 'none', borderRadius: 8,
    background: 'transparent', fontSize: 13, cursor: 'pointer', color: '#475569',
    textAlign: 'left', fontFamily: 'inherit', fontWeight: 500,
    transition: 'all .12s',
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
