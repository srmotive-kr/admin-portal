import { useEffect, useState, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'

// 시드 데이터 저장 성공 시 반드시 호출 — seed_sync_meta.last_updated_at을 직접 갱신한다.
// DB 트리거가 모든 변경에 안정적으로 반응하지 않는 경우가 확인되어(예: 여러 차례 순서 변경
// 저장 후에도 값이 갱신되지 않음), 트리거에만 의존하지 않고 저장 시점에 여기서 명시적으로
// 찍어야 스마트HR+의 버전 비교(runSeedSync)가 실제 변경을 놓치지 않는다.
async function touchSyncMeta() {
  const { error } = await supabase
    .from('seed_sync_meta')
    .update({ last_updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) console.error('[touchSyncMeta]', error.message)
}

// Excel 날짜(Date 객체 또는 시리얼 숫자) → 'YYYY-MM-DD' 문자열 변환
function xlDateToStr(v) {
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof v === 'number') {
    const dt = new Date(Math.round((v - 25569) * 86400 * 1000))
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`
  }
  return String(v ?? '').trim()
}

// 시트의 실제 데이터 범위(!ref) 안 모든 셀에 셀서식 "텍스트"(numFmt '@')를 지정한다 — 스마트HR+
// 업로드양식과 동일한 목적: 엑셀에서 코드번호·날짜·금액을 수정할 때 자동으로 날짜/숫자 서식으로
// 바뀌는 것을 방지한다. 이미 채워진 셀만 대상으로 하며 새로 빈 셀을 추가하지 않는다 — 세액표처럼
// 파서가 "값이 있으면 데이터 행"으로 판단하는 시트에 빈 서식행을 덧붙이면 phantom 행이 파싱될
// 위험이 있어(range_min 등 숫자 컬럼은 빈 문자열이 Number('')===0이 되어 NaN 체크를 통과함),
// 실제 데이터 범위를 넘어서는 패딩은 하지 않는다.
function applyTextFormat(ws) {
  const ref = ws['!ref']
  if (!ref) return
  const range = XLSX.utils.decode_range(ref)
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      if (ws[addr]) ws[addr].z = '@'
    }
  }
}

// Supabase 테이블 전체 조회(1000행 페이지네이션) — "실시간 데이터 다운로드" 전용.
// PostgREST 기본 최대 반환 건수(1000)를 넘는 테이블(예: 근로소득세액표)도 끝까지 받아온다.
async function fetchAllRows(table, { orderCol } = {}) {
  const PAGE = 1000
  let from = 0, all = []
  while (true) {
    let q = supabase.from(table).select('*')
    if (orderCol) q = q.order(orderCol, { ascending: true })
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return all
}

// ─── 코드 그룹 정의 ───────────────────────────────────────────────────────
// 순서: 스마트HR+ 사용자 앱의 코드관리(CodeManager.jsx TAB_LIST)와 동일하게 통일.
// 사용자 앱에 없는 그룹(RESIGN_REASON/SEVERANCE_TYPE)은 뒤쪽에 배치(2026-09-10).
// DEPT(부서명, 2026-09-10 추가): 그동안 배포 파일(001_seed_codes.sql)에만 하드코딩되어 있고
// 이 어드민 포탈 시드 관리 대상에서 빠져 있었다 — "seed 데이터인데 어드민에서 관리 불가"인
// 모순이라 다른 그룹과 동일하게 여기 편입. 이제부터 Admin Portal이 DEPT의 단일 소스다.
const CODE_GROUPS = [
  { code: 'DEPT',          label: '부서명',         hasTaxable: false, hasOrdinary: false },
  { code: 'RANK',          label: '직책명',         hasTaxable: false, hasOrdinary: false },
  { code: 'POS',           label: '직위명',         hasTaxable: false, hasOrdinary: false },
  { code: 'JOB',           label: '업무구분',       hasTaxable: false, hasOrdinary: false },
  { code: 'EMP_TYPE',      label: '고용형태구분',   hasTaxable: false, hasOrdinary: false },
  { code: 'ASSIGN_TYPE',   label: '발령구분',       hasTaxable: false, hasOrdinary: false },
  { code: 'SALARY_TYPE',   label: '급여구분',       hasTaxable: false, hasOrdinary: false },
  // attOptionalNames: 지급방식(정액/출근일기준)을 개별 급여정보 등록 시 사용자가 선택하는 수당.
  // 통상임금 포함여부가 그 선택에 따라 동적으로 결정되므로, 이 seed 화면에서 ordinary_yn을
  // 고정값으로 저장하면 안 됨(항상 'Y' 유지 — 실제 포함여부는 스마트HR+에서 att_based_yn으로 판정).
  { code: 'ALLOWANCE',     label: '수당구분',       hasTaxable: true,  hasOrdinary: true, hasSettle: true, attOptionalNames: ['식대', '교통비'] },
  { code: 'BONUS_TYPE',    label: '상여금구분',     hasTaxable: false, hasOrdinary: false },
  { code: 'LEAVE_TYPE',    label: '휴가구분',       hasTaxable: true,  taxableLabel: '유급여부', hasOrdinary: false },
  { code: 'OUTING_TYPE',   label: '외출/조퇴구분',  hasTaxable: true,  taxableLabel: '유급여부', hasOrdinary: false },
  { code: 'RESIGN_REASON', label: '퇴직사유',       hasTaxable: false, hasOrdinary: false },
  { code: 'SEVERANCE_TYPE',label: '퇴직급여유형',    hasTaxable: false, hasOrdinary: false },
]

const MAIN_TABS = ['코드', '보험요율', '최저임금', '근로소득세액표', '공휴일', '출산육아급여']

// ─── 보험요율 컬럼 정의 ─────────────────────────────────────────────────────
const INS_COLS = [
  { key: 'year',          label: '연도',            type: 'number', width: 70 },
  { key: 'pension_rate',  label: '국민연금(%)',      type: 'rate',   width: 100 },
  { key: 'health_rate',   label: '건강보험(%)',      type: 'rate',   width: 100 },
  { key: 'care_rate',     label: '장기요양(%)',      type: 'rate',   width: 100 },
  { key: 'employ_rate',   label: '고용보험(%)',      type: 'rate',   width: 100 },
  { key: 'apply_from',    label: '적용시작',         type: 'text',   width: 100 },
  { key: 'apply_to',      label: '적용종료',         type: 'text',   width: 100 },
  { key: 'memo',          label: '비고',             type: 'text',   width: undefined },
]

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
export default function SeedEditor() {
  const [mainTab, setMainTab]       = useState('코드')
  const [groupCode, setGroupCode]   = useState('RANK')
  const [showBulk, setShowBulk]     = useState(false)
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h2 style={{ ...s.pageTitle, marginBottom: 0 }}>Seed 데이터 편집기</h2>
        <button style={{ ...s.btn('ghost'), fontSize: 13, padding: '7px 14px' }}
          onClick={() => setShowBulk(true)}>📦 Excel 전체 업로드</button>
      </div>
      <p style={s.desc}>온보딩 마법사에서 기본으로 제공되는 코드·보험요율·세액표·공휴일 데이터를 관리합니다.</p>
      {showBulk && <BulkUploadModal onClose={() => setShowBulk(false)} />}

      {/* 메인 탭 */}
      <div style={s.mainTabs}>
        {MAIN_TABS.map(t => (
          <button key={t} style={{ ...s.mainTab, ...(mainTab === t ? s.mainTabActive : {}) }}
            onClick={() => handleTabChange(t)}>{t}</button>
        ))}
      </div>

      {mainTab === '코드' && (
        <CodeTab groupCode={groupCode} onGroupChange={setGroupCode} onDirtyChange={v => { dirtyRef.current = v }} />
      )}
      {mainTab === '보험요율'      && <InsuranceTab onDirtyChange={v => { dirtyRef.current = v }} />}
      {mainTab === '최저임금'      && <MinimumWageTab onDirtyChange={v => { dirtyRef.current = v }} />}
      {mainTab === '근로소득세액표' && <TaxTab onDirtyChange={v => { dirtyRef.current = v }} />}
      {mainTab === '공휴일'        && <HolidayTab onDirtyChange={v => { dirtyRef.current = v }} />}
      {mainTab === '출산육아급여' && <LeaveRateTab onDirtyChange={v => { dirtyRef.current = v }} />}
    </div>
  )
}

// ─── 저장 결과 안내(2026-09-04) ─────────────────────────────────────────────
// 토스트(인라인 알림 박스)로는 "저장 완료" 메시지가 화면에서 순식간에 사라져(1~2프레임,
// 육안 인지 불가) 사용자가 결과를 확인할 수 없었다 — 화면 녹화로 실제 발생 확인. 근본 원인을
// 특정하지 못해(더블클릭 경합 방지·커스텀 모달 팝업 시도 후에도 재현) 리액트 렌더링에 아예
// 의존하지 않는 브라우저 네이티브 alert()로 대체한다 — alert()는 동기 블로킹 호출이라 사용자가
// 직접 닫기 전까지 물리적으로 사라질 수 없다(state/타이밍 문제의 영향을 받지 않음).
function MsgModal({ msg, onClose }) {
  useEffect(() => {
    if (!msg) return
    window.alert(msg.text)
    onClose()
  }, [msg])
  return null
}

// ─── 코드 탭 ────────────────────────────────────────────────────────────────
function CodeTab({ groupCode, onGroupChange, onDirtyChange }) {
  const grp          = CODE_GROUPS.find(g => g.code === groupCode)
  const [items, setItems]     = useState([])
  const [dirty, setDirty]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)
  // 저장 버튼 연타/더블클릭 방지용 — disabled={saving} 속성만으로는 React 렌더 반영 전에
  // 두 번째 클릭 이벤트가 이미 발생해버릴 수 있다(같은 틱 안에서 두 핸들러가 모두 시작).
  // 두 번째 handleSave가 시작하며 setMsg(null)을 다시 호출하면, 첫 번째가 방금 띄운
  // "저장 완료"가 뜨자마자 지워져 사용자에게는 한 프레임만 깜박이는 것처럼 보인다
  // (2026-09-04, 실제로 이 증상이 재현됨 — 화면 녹화로 1~2프레임만 뜨는 것 확인).
  const savingRef = useRef(false)

  // setMsg(null)을 여기서 하지 않는다 — handleSave 성공 후에도 새로고침을 위해 load()를
  // 그대로 재사용하는데, 여기서 지우면 방금 띄운 "저장 완료" 메시지가 화면에 뜨자마자
  // 사라져 사용자에게는 아무 결과도 안 보인 것처럼 보인다. 초기 진입/그룹전환 시의 메시지
  // 초기화는 아래 useEffect에서 별도로 처리한다.
  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('seed_codes_smart_hr_plus').select('*')
      .eq('group_code', groupCode)
      .order('sort_order', { ascending: true })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setItems((data || []).map(r => ({
      ...r,
      taxable_yn:        r.taxable_yn        ?? 'N',
      ordinary_yn:       r.ordinary_yn       ?? 'Y',
      is_system_default: r.is_system_default ?? 0,
      is_settle_code:    r.is_settle_code    ?? 0,
    })))
    setDirty(false)
    setLoading(false)
  }, [groupCode])

  useEffect(() => { setMsg(null); load() }, [load])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const change = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val, _dirty: true } : it))
    setDirty(true)
  }

  const handleAdd = () => {
    const maxOrder = items.length ? Math.max(...items.map(it => it.sort_order || 0)) + 10 : 10
    setItems(prev => [...prev, {
      id: null, group_code: groupCode, code: '', name: '',
      taxable_yn: 'N', ordinary_yn: 'Y', is_system_default: 0, is_settle_code: 0,
      sort_order: maxOrder, use_yn: 'Y', _dirty: true,
    }])
    setDirty(true)
  }

  const handleMove = (idx, dir) => {
    if (idx + dir < 0 || idx + dir >= items.length) return
    const arr = [...items]
    const tmp = arr[idx]; arr[idx] = arr[idx + dir]; arr[idx + dir] = tmp
    const reordered = arr.map((it, i) => ({ ...it, sort_order: (i + 1) * 10, _dirty: true }))
    setItems(reordered); setDirty(true)
  }

  // 시스템여부는 신규(미저장) 행에서만 지정 가능 — 저장된 행은 이후 전환 불가(읽기전용 배지로 표시).
  const handleToggleSystem = (idx, makeSystem) => {
    change(idx, 'is_system_default', makeSystem ? 1 : 0)
  }

  const handleDelete = async (idx) => {
    const it = items[idx]
    if (it.is_system_default) return
    if (it.id !== null) {
      if (!window.confirm('삭제하시겠습니까?')) return
      const { error } = await supabase.from('seed_codes_smart_hr_plus').delete().eq('id', it.id)
      if (error) { setMsg({ type: 'error', text: error.message }); return }
      await touchSyncMeta()
    }
    // 기존 저장된 행 삭제는 위에서 이미 DB에 반영됐고(신규 미저장 행 삭제는 애초에 저장할 게
    // 없음) — 남은 항목 중 아직 저장 안 한 편집(_dirty)이 있을 때만 "미저장" 상태로 남긴다.
    // 무조건 true로 고정하면, 삭제가 유일한 변경이었을 때 [저장]을 눌러도 toSave가 비어 있어
    // 아무 반응 없이 dirty만 계속 true로 남아 화면 전환 시 "저장하지 않은 변경사항" 경고가
    // 삭제 후 영구히 뜨는 버그가 있었다.
    setItems(prev => {
      const next = prev.filter((_, i) => i !== idx)
      setDirty(next.some(row => row._dirty))
      return next
    })
  }

  const handleSave = async () => {
    if (savingRef.current) return // 연타/더블클릭으로 두 번째 저장이 겹쳐 시작되는 것 차단
    const toSave = items.filter(it => it._dirty)
    if (!toSave.length) return
    savingRef.current = true
    try {
      // 신규 시스템코드는 설명·사용처 입력이 필수 — 로컬 앱의 충돌감지 팝업에서 사용자에게
      // 이 코드가 무엇인지 보여줄 근거 정보이므로 비어있으면 저장을 차단한다.
      const missingInfo = toSave.filter(it =>
        it.id === null && it.is_system_default &&
        (!(it.description || '').trim() || !(it.usage_location || '').trim())
      )
      if (missingInfo.length) {
        const names = missingInfo.map(it => `"${it.name || '(미입력)'}"`).join(', ')
        setMsg({ type: 'error', text: `시스템코드는 설명·사용처를 반드시 입력해야 합니다: ${names}` })
        return
      }
      setSaving(true); setMsg(null)

      // 기존 행의 코드번호를 서로 맞바꾸는 등(예: 정직 60→70, 복직 70→60을 같이 저장) 순차 UPDATE
      // 도중 일시적으로 unique(group_code, code) 제약과 충돌할 수 있다 — 저장 전 기존 행들의 code를
      // 먼저 고유한 임시값(id 기반이라 절대 충돌 안 함)으로 비워 제약을 피한 뒤, 아래 본 저장에서
      // 최종값을 채운다(id는 UUID라 항상 unique).
      const existing = toSave.filter(it => it.id !== null)
      for (const it of existing) {
        const { error } = await supabase.from('seed_codes_smart_hr_plus')
          .update({ code: `~tmp-${it.id}` }).eq('id', it.id)
        if (error) { setMsg({ type: 'error', text: error.message }); return }
      }

      for (const it of toSave) {
        // 지급방식에 따라 통상임금 포함여부가 달라지는 수당(식대/교통비 등)은 여기서 고정값을
        // 저장하면 안 되므로 항상 'Y'로 강제한다 — 실제 포함여부는 개별 급여정보 등록 시
        // 사용자가 선택한 지급방식(att_based_yn)으로 스마트HR+에서 판정한다.
        const isAttOptional = grp?.attOptionalNames?.includes((it.name || '').trim())
        const payload = {
          group_code:        it.group_code,
          code:              (it.code || '').toUpperCase().trim(),
          name:              (it.name || '').trim(),
          sort_order:        it.sort_order,
          use_yn:            it.use_yn,
          taxable_yn:        it.taxable_yn,
          ordinary_yn:       isAttOptional ? 'Y' : it.ordinary_yn,
          is_system_default: it.is_system_default || 0,
          is_settle_code:    it.is_settle_code    || 0,
          description:       (it.description || '').trim() || null,
          usage_location:    (it.usage_location || '').trim() || null,
          synonyms:           (it.synonyms || '').trim() || null,
        }
        if (!payload.name) continue
        if (it.id === null) {
          const { error } = await supabase.from('seed_codes_smart_hr_plus').insert(payload)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        } else {
          const { error } = await supabase.from('seed_codes_smart_hr_plus').update(payload).eq('id', it.id)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        }
      }
      await touchSyncMeta()
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
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
      {/* 그룹 사이드바 */}
      <div style={s.groupSidebar}>
        {CODE_GROUPS.map(g => (
          <button key={g.code}
            style={{ ...s.groupBtn, ...(groupCode === g.code ? s.groupBtnActive : {}) }}
            onClick={() => {
              if (dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?')) return
              onGroupChange(g.code)
            }}>
            {g.label}
          </button>
        ))}
      </div>

      {/* 본문 */}
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

        {groupCode === 'ALLOWANCE' && (
          <div style={s.helpBox}>
            <div style={s.helpTitle}>ℹ️ 설명 · 사용처 · 유사어는 왜 입력하나요?</div>
            <p style={s.helpP}>
              이 화면에서 추가하는 <strong>시스템 코드</strong>는 스마트HR+를 쓰는 모든 고객사에
              그대로 배포됩니다. 그런데 고객사가 이미 자기 회사만의 "일반 코드"로 비슷한 수당을
              직접 만들어 쓰고 있을 수 있습니다(예: 시스템에 "식대"를 새로 추가했는데, 어느
              고객사는 이미 "식비"라는 이름으로 같은 걸 운영 중인 경우). 이걸 그대로 두면
              사실상 같은 수당이 코드 두 개로 쪼개져 통계·통상임금 계산이 어긋납니다.
            </p>
            <ul style={s.helpUl}>
              <li><strong>유사어</strong> — 이 코드의 다른 이름들을 쉼표로 구분해 적습니다(예:
                "식대"의 유사어로 <code>식비, 밥값</code>). 사용자 앱이 새 시스템코드를 받을 때
                이름 또는 유사어가 고객사의 기존 일반 코드와 겹치는지 자동으로 검사해서(완전
                일치·부분포함만 인식 — 오타 같은 애매한 유사 매칭은 하지 않음) "이거 같은
                건가요?" 병합 확인 팝업을 띄우는 데 씁니다. 비워두면 이름이 정확히 같을 때만
                감지됩니다.</li>
              <li><strong>설명 / 사용처</strong> — 그 병합 확인 팝업에 그대로 표시되는 문구입니다.
                고객사 담당자가 "이 시스템 코드가 뭐 하는 건지" 판단할 근거이므로, 실제
                화면·기능 이름을 적어야 합니다(예: 설명 "식사 제공을 대신하는 정액 수당",
                사용처 "급여정보 » 수당 등록").</li>
            </ul>
            <p style={{ ...s.helpP, marginBottom: 0 }}>
              세 필드 모두 <strong>신규 시스템 코드를 추가할 때만</strong> 입력할 수 있고(체크박스로
              "시스템"을 켠 새 행), 저장 후에는 수정할 수 없습니다 — 이미 배포된 코드의 뜻이
              나중에 바뀌면 과거에 병합 판단을 내린 근거 자체가 달라지기 때문입니다. 일반
              코드에는 해당하지 않습니다.
            </p>
          </div>
        )}

        {loading ? (
          <div style={s.empty}>로딩 중…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 48, textAlign: 'center' }}>순서</th>
                  <th style={{ ...s.th, width: 100 }}>코드</th>
                  <th style={s.th}>코드명</th>
                  <th style={{ ...s.th, width: 170 }}>설명</th>
                  <th style={{ ...s.th, width: 170 }}>사용처</th>
                  <th style={{ ...s.th, width: 140 }}>유사어</th>
                  {grp?.hasTaxable && (
                    <th style={{ ...s.th, width: 80, textAlign: 'center' }}>
                      {grp.taxableLabel || '과세여부'}
                    </th>
                  )}
                  {grp?.hasOrdinary && (
                    <th style={{ ...s.th, width: 120, textAlign: 'center' }}>통상임금여부</th>
                  )}
                  {grp?.hasSettle && (
                    <th style={{ ...s.th, width: 80, textAlign: 'center' }}>정산코드</th>
                  )}
                  <th style={{ ...s.th, width: 90, textAlign: 'center' }}>시스템여부</th>
                  <th style={{ ...s.th, width: 64, textAlign: 'center' }}>이동</th>
                  <th style={{ ...s.th, width: 56, textAlign: 'center' }}>삭제</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={13} style={s.empty}>등록된 데이터가 없습니다.</td></tr>
                ) : items.map((it, idx) => {
                  const isSys = !!it.is_system_default
                  return (
                    <tr key={idx} style={{ background: it._dirty ? 'rgba(37,99,235,.03)' : (isSys ? 'rgba(251,191,36,.04)' : 'transparent'), borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ ...s.td, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>{idx + 1}</td>
                      <td style={s.td}>
                        {isSys ? (
                          <span style={s.codeTag}>
                            {it.code}
                            <span style={s.sysBadge}>시스템</span>
                          </span>
                        ) : (
                          <input style={{ ...s.input, fontFamily: 'monospace', width: 80 }}
                            value={it.code}
                            onChange={e => change(idx, 'code', e.target.value.toUpperCase())}
                            placeholder="코드" maxLength={10} />
                        )}
                      </td>
                      <td style={s.td}>
                        <input style={{ ...s.input, background: isSys ? '#F0F4FF' : '#F8FAFC' }}
                          value={it.name}
                          onChange={e => change(idx, 'name', e.target.value)}
                          placeholder="코드명 입력" />
                      </td>
                      <td style={s.td}>
                        {(it.id === null && isSys) ? (
                          <input style={s.input} value={it.description || ''}
                            onChange={e => change(idx, 'description', e.target.value)}
                            placeholder="이 코드의 용도 (필수)" />
                        ) : (
                          <span style={{ fontSize: 12, color: '#7A88AA' }}>{it.description || '-'}</span>
                        )}
                      </td>
                      <td style={s.td}>
                        {(it.id === null && isSys) ? (
                          <input style={s.input} value={it.usage_location || ''}
                            onChange={e => change(idx, 'usage_location', e.target.value)}
                            placeholder="사용 화면/기능 (필수)" />
                        ) : (
                          <span style={{ fontSize: 12, color: '#7A88AA' }}>{it.usage_location || '-'}</span>
                        )}
                      </td>
                      <td style={s.td}>
                        {(it.id === null && isSys) ? (
                          <input style={s.input} value={it.synonyms || ''}
                            onChange={e => change(idx, 'synonyms', e.target.value)}
                            placeholder="유사어(쉼표구분, 선택)" />
                        ) : (
                          <span style={{ fontSize: 12, color: '#7A88AA' }}>{it.synonyms || '-'}</span>
                        )}
                      </td>
                      {grp?.hasTaxable && (() => {
                        const isPaid = it.taxable_yn === 'Y'
                        return (
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            <input type="checkbox" checked={isPaid}
                              onChange={e => change(idx, 'taxable_yn', e.target.checked ? 'Y' : 'N')} />
                          </td>
                        )
                      })()}
                      {grp?.hasOrdinary && (() => {
                        const isOrd = (it.ordinary_yn ?? 'Y') === 'Y'
                        const isAttOptional = grp?.attOptionalNames?.includes((it.name || '').trim())
                        return (
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            {isAttOptional ? (
                              <span title="개별 급여정보 등록 시 선택하는 지급방식(정액/출근일기준)에 따라 통상임금 포함여부가 자동 결정되므로 여기서 고정할 수 없습니다."
                                style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', cursor: 'help' }}>
                                지급방식에 따라 결정
                              </span>
                            ) : (
                              <input type="checkbox" checked={isOrd}
                                onChange={e => change(idx, 'ordinary_yn', e.target.checked ? 'Y' : 'N')} />
                            )}
                          </td>
                        )
                      })()}
                      {grp?.hasSettle && (
                        <td style={{ ...s.td, textAlign: 'center' }} title="정산업무(연월차·보상휴가·건강고용보험·급여소급·교대근무 등)에서 확정 시에만 시스템이 자동 주입하는 코드인지 여부 — 켜면 급여정보 화면의 상시 수당 목록에서 숨겨집니다.">
                          <input type="checkbox" checked={!!it.is_settle_code}
                            onChange={e => change(idx, 'is_settle_code', e.target.checked ? 1 : 0)} />
                        </td>
                      )}
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        {it.id === null ? (
                          <input type="checkbox" checked={isSys}
                            onChange={e => handleToggleSystem(idx, e.target.checked)} />
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 600, color: isSys ? '#B45309' : '#94A3B8' }}>
                            {isSys ? '시스템' : '일반'}
                          </span>
                        )}
                      </td>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                          <button style={s.arrowBtn} onClick={() => handleMove(idx, -1)} disabled={idx === 0}>▲</button>
                          <button style={s.arrowBtn} onClick={() => handleMove(idx, 1)} disabled={idx === items.length - 1}>▼</button>
                        </div>
                      </td>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        {isSys ? (
                          <span style={{ fontSize: 11, color: '#C0CBDF' }}>잠금</span>
                        ) : (
                          <button style={s.btnDel} onClick={() => handleDelete(idx)}>삭제</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={s.notice}>
          시스템 코드: 100 미만{groupCode === 'ALLOWANCE' ? ' (그중 991~999는 정산전용 코드)' : ''} · 일반 코드: 100 이상 —
          스마트HR+ 사용자 앱에서 등록하는 일반 코드도 항상 100 이상 번호를 쓰도록 강제되어 있어,
          어드민 포탈에서 100 미만 번호로 등록·수정해도 사용자 앱의 코드와 겹칠 위험이 없습니다.
        </div>
      </div>
    </div>
  )
}

// ─── 보험요율 탭 ──────────────────────────────────────────────────────────────
function InsuranceTab({ onDirtyChange }) {
  const [items, setItems]     = useState([])
  const [dirty, setDirty]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)
  const savingRef = useRef(false) // 저장 버튼 연타 방지(2026-09-04, CodeTab과 동일한 이유)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('insurance_rates').select('*').order('year', { ascending: false })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setItems(data || []); setDirty(false); setLoading(false)
  }
  useEffect(() => { setMsg(null); load() }, [])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const change = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val, _dirty: true } : it))
    setDirty(true)
  }

  const handleAdd = () => {
    setItems(prev => [...prev, {
      id: null, year: new Date().getFullYear(),
      pension_rate: 0.09, health_rate: 0.0709, care_rate: 0.1295, employ_rate: 0.018,
      pension_upper_limit: 0, pension_lower_limit: 0,
      apply_from: null, apply_to: null, memo: '', _dirty: true,
    }])
    setDirty(true)
  }

  const handleDelete = async (idx) => {
    const it = items[idx]
    if (it.id !== null) {
      if (!window.confirm(`${it.year}년 보험요율을 삭제하시겠습니까?`)) return
      const { error } = await supabase.from('insurance_rates').delete().eq('id', it.id)
      if (error) { setMsg({ type: 'error', text: error.message }); return }
      await touchSyncMeta()
    }
    setItems(prev => {
      const next = prev.filter((_, i) => i !== idx)
      setDirty(next.some(row => row._dirty))
      return next
    })
  }

  const handleSave = async () => {
    if (savingRef.current) return
    const toSave = items.filter(it => it._dirty)
    if (!toSave.length) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      for (const it of toSave) {
        const { _dirty, id, ...payload } = it
        if (id === null) {
          const { error } = await supabase.from('insurance_rates').insert(payload)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        } else {
          const { error } = await supabase.from('insurance_rates').update(payload).eq('id', id)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        }
      }
      await touchSyncMeta()
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
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

  const fmtRate = v => v != null ? (Number(v) * 100).toFixed(4).replace(/\.?0+$/, '') + '%' : ''

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>
          총 <strong style={{ color: '#2563EB' }}>{items.length}</strong>건
          {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('success')} onClick={handleAdd} disabled={saving}>+ 연도 추가</button>
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
                <th style={{ ...s.th, width: 80 }}>연도</th>
                <th style={{ ...s.th, width: 150, textAlign: 'center' }}>국민연금</th>
                <th style={{ ...s.th, width: 130, textAlign: 'center' }}>연금 상한액</th>
                <th style={{ ...s.th, width: 130, textAlign: 'center' }}>연금 하한액</th>
                <th style={{ ...s.th, width: 150, textAlign: 'center' }}>건강보험</th>
                <th style={{ ...s.th, width: 150, textAlign: 'center' }}>장기요양</th>
                <th style={{ ...s.th, width: 150, textAlign: 'center' }}>고용보험</th>
                <th style={{ ...s.th, width: 140 }}>적용시작</th>
                <th style={{ ...s.th, width: 140 }}>적용종료</th>
                <th style={s.th}>비고</th>
                <th style={{ ...s.th, width: 64, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} style={{ background: it._dirty ? 'rgba(37,99,235,.03)' : 'transparent', borderBottom: '1px solid #F1F5F9' }}>
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 68, textAlign: 'center' }}
                      type="text" inputMode="numeric" value={it.year}
                      onChange={e => change(idx, 'year', Number(e.target.value))} />
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                      <input style={{ ...s.input, width: 70, textAlign: 'right' }}
                        type="text" inputMode="decimal" value={parseFloat((Number(it.pension_rate || 0) * 100).toFixed(4))}
                        onChange={e => change(idx, 'pension_rate', Number(e.target.value) / 100)} />
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>%</span>
                    </div>
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <input style={{ ...s.input, width: 110, textAlign: 'right' }}
                      type="text" inputMode="numeric" value={it.pension_upper_limit || 0}
                      onChange={e => change(idx, 'pension_upper_limit', Number(e.target.value))} />
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <input style={{ ...s.input, width: 110, textAlign: 'right' }}
                      type="text" inputMode="numeric" value={it.pension_lower_limit || 0}
                      onChange={e => change(idx, 'pension_lower_limit', Number(e.target.value))} />
                  </td>
                  {['health_rate','care_rate','employ_rate'].map(key => (
                    <td key={key} style={{ ...s.td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                        <input style={{ ...s.input, width: 70, textAlign: 'right' }}
                          type="text" inputMode="decimal" value={parseFloat((Number(it[key] || 0) * 100).toFixed(4))}
                          onChange={e => change(idx, key, Number(e.target.value) / 100)} />
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>%</span>
                      </div>
                    </td>
                  ))}
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 130 }} type="month"
                      value={it.apply_from ? it.apply_from.slice(0, 7) : ''}
                      onChange={e => change(idx, 'apply_from', e.target.value || null)} />
                  </td>
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 130 }} type="month"
                      value={it.apply_to ? it.apply_to.slice(0, 7) : ''}
                      onChange={e => change(idx, 'apply_to', e.target.value || null)} />
                  </td>
                  <td style={s.td}>
                    <input style={s.input} value={it.memo || ''}
                      onChange={e => change(idx, 'memo', e.target.value)}
                      placeholder="비고" />
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <button style={s.btnDel} onClick={() => handleDelete(idx)}>삭제</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={11} style={s.empty}>등록된 보험요율이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── 최저임금 탭 ──────────────────────────────────────────────────────────────
function MinimumWageTab({ onDirtyChange }) {
  const [items, setItems]     = useState([])
  const [dirty, setDirty]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)
  const savingRef = useRef(false) // 저장 버튼 연타 방지(2026-09-04, CodeTab과 동일한 이유)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('minimum_wage').select('*').order('effective_from', { ascending: false })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setItems(data || []); setDirty(false); setLoading(false)
  }
  useEffect(() => { setMsg(null); load() }, [])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const change = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val, _dirty: true } : it))
    setDirty(true)
  }

  const handleAdd = () => {
    setItems(prev => [...prev, {
      id: null, effective_from: `${new Date().getFullYear() + 1}-01-01`,
      amount: 0, memo: '', _dirty: true,
    }])
    setDirty(true)
  }

  const handleDelete = async (idx) => {
    const it = items[idx]
    if (it.id !== null) {
      if (!window.confirm(`${it.effective_from} 최저임금을 삭제하시겠습니까?`)) return
      const { error } = await supabase.from('minimum_wage').delete().eq('id', it.id)
      if (error) { setMsg({ type: 'error', text: error.message }); return }
      await touchSyncMeta()
    }
    setItems(prev => {
      const next = prev.filter((_, i) => i !== idx)
      setDirty(next.some(row => row._dirty))
      return next
    })
  }

  const handleSave = async () => {
    if (savingRef.current) return
    const toSave = items.filter(it => it._dirty)
    if (!toSave.length) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      for (const it of toSave) {
        const { _dirty, id, ...payload } = it
        if (id === null) {
          const { error } = await supabase.from('minimum_wage').insert(payload)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        } else {
          const { error } = await supabase.from('minimum_wage').update(payload).eq('id', id)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        }
      }
      await touchSyncMeta()
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
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
          <button style={s.btn('success')} onClick={handleAdd} disabled={saving}>+ 연도 추가</button>
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
                <th style={{ ...s.th, width: 140 }}>적용시작일</th>
                <th style={{ ...s.th, width: 140, textAlign: 'right' }}>시급(원)</th>
                <th style={s.th}>비고</th>
                <th style={{ ...s.th, width: 64, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} style={{ background: it._dirty ? 'rgba(37,99,235,.03)' : 'transparent', borderBottom: '1px solid #F1F5F9' }}>
                  <td style={s.td}>
                    <input style={s.input} type="date" value={it.effective_from}
                      onChange={e => change(idx, 'effective_from', e.target.value)} />
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <input style={{ ...s.input, textAlign: 'right' }}
                      type="text" inputMode="numeric" value={it.amount}
                      onChange={e => change(idx, 'amount', Number(e.target.value))} />
                  </td>
                  <td style={s.td}>
                    <input style={s.input} value={it.memo || ''}
                      onChange={e => change(idx, 'memo', e.target.value)}
                      placeholder="비고" />
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <button style={s.btnDel} onClick={() => handleDelete(idx)}>삭제</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} style={s.empty}>등록된 최저임금이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── 근로소득세액표 탭 (서브탭: 간이세액표 / 초과세율표) ──────────────────────
function TaxTab({ onDirtyChange }) {
  const [taxSubTab, setTaxSubTab] = useState('간이세액표')
  const taxDirtyRef = useRef(false)

  const handleSubTabChange = (t) => {
    if (taxDirtyRef.current) {
      if (!window.confirm('저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?')) return
    }
    taxDirtyRef.current = false
    setTaxSubTab(t)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #E2E8F0' }}>
        {['간이세액표', '초과세율표'].map(t => (
          <button key={t}
            style={{ padding: '6px 18px', border: 'none', background: 'transparent',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              color: taxSubTab === t ? '#2563EB' : '#64748B',
              borderBottom: taxSubTab === t ? '2px solid #2563EB' : '2px solid transparent',
              marginBottom: -1, transition: 'color .15s' }}
            onClick={() => handleSubTabChange(t)}>{t}</button>
        ))}
      </div>
      {taxSubTab === '간이세액표' && <SimpleTaxSection />}
      {taxSubTab === '초과세율표' && <ExcessRateSection onDirtyChange={v => { taxDirtyRef.current = v; onDirtyChange?.(v) }} />}
    </div>
  )
}

// ─── 간이세액표 섹션 ─────────────────────────────────────────────────────────
function SimpleTaxSection() {
  const [afList, setAfList]       = useState([])   // [{ applyFrom, count }]
  const [loading, setLoading]     = useState(true)
  const [msg, setMsg]             = useState(null)
  const [popup, setPopup]         = useState(null) // null | { applyFrom, rows }
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const load = async () => {
    setLoading(true)
    const { data: versions, error } = await supabase.rpc('get_income_tax_versions')
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setAfList((versions || []).map(r => ({ applyFrom: r.apply_from, count: Number(r.cnt) })))
    setLoading(false)
  }
  useEffect(() => { setMsg(null); load() }, [])

  const handleDelete = async (applyFrom) => {
    const item = afList.find(y => y.applyFrom === applyFrom)
    if (!window.confirm(`${applyFrom} 세액표 전체(${item?.count || 0}건)를 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('income_tax_table').delete().eq('apply_from', applyFrom)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    await touchSyncMeta()
    load()
  }

  const handleRowClick = async (applyFrom) => {
    setPopup({ applyFrom, rows: null })
    try {
      const BATCH = 1000
      let allData = [], from = 0
      while (true) {
        const { data, error } = await supabase
          .from('income_tax_table')
          .select('range_min,range_max,dependents,tax_amount')
          .eq('apply_from', applyFrom)
          .order('range_min', { ascending: true })
          .order('dependents', { ascending: true })
          .range(from, from + BATCH - 1)
        if (error) throw error
        allData = [...allData, ...(data || [])]
        if (!data || data.length < BATCH) break
        from += BATCH
      }
      const map = new Map()
      for (const r of allData) {
        const key = `${r.range_min}-${r.range_max ?? 'anchor'}`
        if (!map.has(key)) map.set(key, { range_min: r.range_min, range_max: r.range_max })
        map.get(key)[`dep_${r.dependents}`] = r.tax_amount
      }
      setPopup({ applyFrom, rows: [...map.values()] })
    } catch (err) {
      setMsg({ type: 'error', text: err.message }); setPopup(null)
    }
  }

  const downloadTemplate = () => {
    const today = new Date().toISOString().slice(0, 10)
    const headers = ['적용일자', '이상(원)', '미만(원)', '1인', '2인', '3인', '4인', '5인', '6인', '7인', '8인', '9인', '10인', '11인']
    const sample1 = [today, 770000, 775000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const sample2 = ['', 775000, 780000, 19220, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2])
    const wb2 = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb2, ws, '세액표')
    XLSX.writeFile(wb2, '간이세액표_업로드양식.xlsx')
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setMsg(null)
    try {
      const buf = await file.arrayBuffer()
      const wb2 = XLSX.read(buf, { type: 'array' })
      const ws = wb2.Sheets['세액표']
      if (!ws) throw new Error("'세액표' 시트를 찾을 수 없습니다.")
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 })
      // Row 0: 헤더 / Row 1+: 데이터
      // A(0)=적용일자, B(1)=이상(원), C(2)=미만(원), D(3)~N(13)=1인~11인
      const safeN = (v, def = 0) => { const n = Number(v ?? def); return isNaN(n) ? def : n }
      const rowsByAf = new Map()
      let lastAf = null
      for (let i = 1; i < rawRows.length; i++) {
        const r = rawRows[i]
        const af = xlDateToStr(r[0])
        if (af) lastAf = af
        if (!lastAf) continue
        const rmin = safeN(r[1], NaN)
        if (isNaN(rmin)) continue
        const rmxRaw = r[2]
        const rmax = (rmxRaw == null || String(rmxRaw).trim() === '') ? null : safeN(rmxRaw)
        if (!rowsByAf.has(lastAf)) rowsByAf.set(lastAf, [])
        for (let d = 1; d <= 11; d++) {
          rowsByAf.get(lastAf).push({ apply_from: lastAf, range_min: rmin, range_max: rmax, dependents: d, tax_amount: safeN(r[2 + d]) })
        }
      }
      if (!rowsByAf.size) throw new Error('업로드 데이터가 없습니다. 양식을 확인하세요.')
      for (const [af, rows] of rowsByAf) {
        const { error: delErr } = await supabase.from('income_tax_table').delete().eq('apply_from', af)
        if (delErr) throw delErr
        const CHUNK = 500
        for (let i = 0; i < rows.length; i += CHUNK) {
          const { error } = await supabase.from('income_tax_table').insert(rows.slice(i, i + CHUNK))
          if (error) throw error
        }
      }
      const totalRows = [...rowsByAf.values()].reduce((s, a) => s + a.length, 0)
      const afs = [...rowsByAf.keys()].join(', ')
      await touchSyncMeta()
      setMsg({ type: 'success', text: `${afs} 세액표 ${totalRows}건 업로드 완료` })
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
    setUploading(false); e.target.value = ''
  }

  return (
    <div style={s.card}>
      {popup && (
        <div style={s.popupOverlay} onClick={() => setPopup(null)}>
          <div style={s.popupDialog} onClick={ev => ev.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1E293B' }}>
                근로소득 간이세액표 ({popup.applyFrom} 시행)
              </h3>
              <button onClick={() => setPopup(null)} style={s.alertClose}>×</button>
            </div>
            {!popup.rows ? (
              <div style={s.empty}>로딩 중…</div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
                <table style={{ ...s.table, fontSize: 11, minWidth: 900 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#FAFBFC', zIndex: 1 }}>
                    <tr>
                      <th style={{ ...s.th, width: 90, textAlign: 'right', whiteSpace: 'nowrap' }}>이상(원)</th>
                      <th style={{ ...s.th, width: 90, textAlign: 'right', whiteSpace: 'nowrap' }}>미만(원)</th>
                      {[1,2,3,4,5,6,7,8,9,10,11].map(n => (
                        <th key={n} style={{ ...s.th, width: 65, textAlign: 'right', whiteSpace: 'nowrap' }}>{n}인</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {popup.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.range_min?.toLocaleString()}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.range_max == null ? '#2563EB' : undefined }}>
                          {r.range_max == null ? '정액' : r.range_max?.toLocaleString()}
                        </td>
                        {[1,2,3,4,5,6,7,8,9,10,11].map(n => (
                          <td key={n} style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r[`dep_${n}`] === 0 ? '#CBD5E1' : '#1E293B' }}>
                            {r[`dep_${n}`] != null ? r[`dep_${n}`].toLocaleString() : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 12, color: '#94A3B8', textAlign: 'right' }}>
              총 {popup.rows?.length?.toLocaleString() ?? '…'}개 급여구간
            </div>
          </div>
        </div>
      )}
      <div style={s.toolbar}>
        <span style={s.cnt}>총 <strong style={{ color: '#2563EB' }}>{afList.length}</strong>개 시행일</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={s.btn('ghost')} onClick={load}>↺ 새로고침</button>
          <button style={s.btn('ghost')} onClick={downloadTemplate}>📥 양식 다운로드</button>
          <button style={s.btn('success')} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? '업로드 중…' : '📤 Excel 업로드'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleUpload} />
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 130 }}>시행일</th>
              <th style={{ ...s.th, width: 120 }}>데이터 수</th>
              <th style={s.th}>설명</th>
              <th style={{ ...s.th, width: 64, textAlign: 'center' }}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {afList.length === 0 ? (
              <tr><td colSpan={4} style={s.empty}>등록된 세액표가 없습니다.</td></tr>
            ) : afList.map(({ applyFrom, count }) => (
              <tr key={applyFrom} style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                onClick={() => handleRowClick(applyFrom)}>
                <td style={{ ...s.td, fontWeight: 700 }}>{applyFrom}</td>
                <td style={s.td}>{count.toLocaleString()}건</td>
                <td style={{ ...s.td, color: '#64748B', fontSize: 12 }}>
                  국세청 근로소득 간이세액표 {applyFrom} 시행 — 클릭하면 내역 조회
                </td>
                <td style={{ ...s.td, textAlign: 'center' }} onClick={ev => ev.stopPropagation()}>
                  <button style={s.btnDel} onClick={() => handleDelete(applyFrom)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── 초과세율표 섹션 ─────────────────────────────────────────────────────────
function ExcessRateSection({ onDirtyChange }) {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [dirty, setDirty]       = useState(false)
  const [msg, setMsg]           = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const savingRef = useRef(false) // 저장 버튼 연타 방지(2026-09-04, CodeTab과 동일한 이유)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('income_tax_excess_rate').select('*')
      .order('apply_from', { ascending: false })
      .order('threshold_from', { ascending: true })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setRows(data || []); setDirty(false); setLoading(false)
  }
  useEffect(() => { setMsg(null); load() }, [])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const change = (idx, key, val) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val, _dirty: true } : r))
    setDirty(true)
  }

  const handleAdd = () => {
    const lastAf = rows[0]?.apply_from ?? new Date().toISOString().slice(0, 10)
    setRows(prev => [...prev, {
      id: null, apply_from: lastAf,
      threshold_from: 0, threshold_to: null,
      accumulated: 0, factor: 0.98, rate: 0, _dirty: true,
    }])
    setDirty(true)
  }

  const handleDelete = async (idx) => {
    const r = rows[idx]
    if (r.id !== null) {
      if (!window.confirm(`threshold_from=${Number(r.threshold_from).toLocaleString()} 행을 삭제하시겠습니까?`)) return
      const { error } = await supabase.from('income_tax_excess_rate').delete().eq('id', r.id)
      if (error) { setMsg({ type: 'error', text: error.message }); return }
      await touchSyncMeta()
    }
    setRows(prev => {
      const next = prev.filter((_, i) => i !== idx)
      setDirty(next.some(row => row._dirty))
      return next
    })
  }

  const handleSave = async () => {
    if (savingRef.current) return
    const toSave = rows.filter(r => r._dirty)
    if (!toSave.length) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      for (const r of toSave) {
        const { _dirty, id, created_at, ...payload } = r
        payload.threshold_from = Number(payload.threshold_from)
        payload.threshold_to   = (payload.threshold_to === '' || payload.threshold_to == null) ? null : Number(payload.threshold_to)
        payload.accumulated    = Number(payload.accumulated)
        payload.factor         = Number(payload.factor)
        payload.rate           = Number(payload.rate)
        const { error } = id === null
          ? await supabase.from('income_tax_excess_rate').insert(payload)
          : await supabase.from('income_tax_excess_rate').update(payload).eq('id', id)
        if (error) { setMsg({ type: 'error', text: error.message }); return }
      }
      await touchSyncMeta()
      setMsg({ type: 'success', text: `${toSave.length}건 정상적으로 저장되었습니다.` })
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

  const downloadTemplate = () => {
    const today = new Date().toISOString().slice(0, 10)
    const headers = ['적용일자', '구간시작(원) 초과', '구간끝(원) 이하', '누적세액(원)', '보정비율', '세율']
    const samples = [
      [today, 10000000, 14000000,   25000, 0.98, 0.35],
      [today, 14000000, 28000000, 1397000, 0.98, 0.38],
      [today, 28000000, 30000000, 6610600, 0.98, 0.40],
      [today, 30000000, 45000000, 7394600, 0.98, 0.40],
      [today, 45000000, 87000000, 13394600, 0.98, 0.42],
      [today, 87000000, '',       31034600, 0.98, 0.45],
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers, ...samples])
    const wb2 = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb2, ws, '초과세율')
    XLSX.writeFile(wb2, '초과세율표_업로드양식.xlsx')
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setMsg(null)
    try {
      const buf = await file.arrayBuffer()
      const wb2 = XLSX.read(buf, { type: 'array' })
      const ws = wb2.Sheets['초과세율']
      if (!ws) throw new Error("'초과세율' 시트를 찾을 수 없습니다.")
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 })
      const safeN = (v, def = 0) => { const n = Number(v ?? def); return isNaN(n) ? def : n }
      const parsed = []
      for (let i = 1; i < rawRows.length; i++) {
        const r = rawRows[i]
        const af = xlDateToStr(r[0])
        if (!af) continue
        const tf = safeN(r[1], NaN)
        if (isNaN(tf)) continue
        const ttRaw = r[2]
        const tt = (ttRaw == null || String(ttRaw).trim() === '') ? null : safeN(ttRaw)
        parsed.push({ apply_from: af, threshold_from: tf, threshold_to: tt, accumulated: safeN(r[3]), factor: safeN(r[4], 0.98), rate: safeN(r[5]) })
      }
      if (!parsed.length) throw new Error('업로드 데이터가 없습니다. 양식을 확인하세요.')
      const afs = [...new Set(parsed.map(r => r.apply_from))]
      // 기존 데이터 백업 (삽입 실패 시 복원용)
      const { data: backup } = await supabase.from('income_tax_excess_rate')
        .select('apply_from,threshold_from,threshold_to,accumulated,factor,rate')
        .in('apply_from', afs)
      for (const af of afs) {
        const { error: delErr } = await supabase.from('income_tax_excess_rate').delete().eq('apply_from', af)
        if (delErr) throw delErr
      }
      const { error } = await supabase.from('income_tax_excess_rate').insert(parsed)
      if (error) {
        if (backup?.length) await supabase.from('income_tax_excess_rate').insert(backup)
        throw error
      }
      await touchSyncMeta()
      setMsg({ type: 'success', text: `${afs.join(', ')} 초과세율표 ${parsed.length}건 업로드 완료` })
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
    setUploading(false); e.target.value = ''
  }

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>총 <strong style={{ color: '#2563EB' }}>{rows.length}</strong>개 구간</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={s.btn('ghost')} onClick={load}>↺ 새로고침</button>
          <button style={s.btn('ghost')} onClick={downloadTemplate}>📥 양식 다운로드</button>
          <button style={s.btn('success')} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? '업로드 중…' : '📤 Excel 업로드'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleUpload} />
          <button style={s.btn('ghost')} onClick={handleAdd}>+ 행 추가</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ ...s.table, minWidth: 780 }}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: 120 }}>시행일</th>
                <th style={{ ...s.th, width: 130, textAlign: 'right' }}>구간시작(원) 초과</th>
                <th style={{ ...s.th, width: 130, textAlign: 'right' }}>구간끝(원) 이하</th>
                <th style={{ ...s.th, width: 120, textAlign: 'right' }}>누적세액(원)</th>
                <th style={{ ...s.th, width: 90, textAlign: 'right' }}>보정비율</th>
                <th style={{ ...s.th, width: 90, textAlign: 'right' }}>세율</th>
                <th style={{ ...s.th, width: 64, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} style={s.empty}>등록된 초과세율 구간이 없습니다.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id ?? `new-${i}`} style={{ borderBottom: '1px solid #F1F5F9', background: r._dirty ? '#FFFBEB' : undefined }}>
                  <td style={s.td}>
                    <input value={r.apply_from} onChange={e => change(i, 'apply_from', e.target.value)}
                      style={{ ...s.input, width: 110 }} placeholder="YYYY-MM-DD" />
                  </td>
                  <td style={s.td}>
                    <input type="text" inputMode="numeric" value={r.threshold_from} onChange={e => change(i, 'threshold_from', e.target.value)}
                      style={{ ...s.input, textAlign: 'right', width: 120 }} />
                  </td>
                  <td style={s.td}>
                    <input type="text" inputMode="numeric" value={r.threshold_to ?? ''} onChange={e => change(i, 'threshold_to', e.target.value === '' ? null : e.target.value)}
                      style={{ ...s.input, textAlign: 'right', width: 120 }} placeholder="(최고 구간)" />
                  </td>
                  <td style={s.td}>
                    <input type="text" inputMode="numeric" value={r.accumulated} onChange={e => change(i, 'accumulated', e.target.value)}
                      style={{ ...s.input, textAlign: 'right', width: 110 }} />
                  </td>
                  <td style={s.td}>
                    <input type="text" inputMode="decimal" value={r.factor} onChange={e => change(i, 'factor', e.target.value)}
                      style={{ ...s.input, textAlign: 'right', width: 80 }} />
                  </td>
                  <td style={s.td}>
                    <input type="text" inputMode="decimal" value={r.rate} onChange={e => change(i, 'rate', e.target.value)}
                      style={{ ...s.input, textAlign: 'right', width: 80 }} />
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <button style={s.btnDel} onClick={() => handleDelete(i)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 11, color: '#94A3B8' }}>
        ※ 구간시작 초과 ~ 구간끝 이하 / 구간끝 비워두면 최고 구간(무한대) / 보정비율 0.98 = 98%
      </div>
    </div>
  )
}

// ─── 공휴일 탭 ──────────────────────────────────────────────────────────────
function HolidayTab({ onDirtyChange }) {
  const [year, setYear]         = useState(new Date().getFullYear())
  const [items, setItems]       = useState([])
  const [dirty, setDirty]       = useState(false)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState(null)
  const [yearList, setYearList] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const savingRef = useRef(false) // 저장 버튼 연타 방지(2026-09-04, CodeTab과 동일한 이유)

  const loadYears = async () => {
    const { data } = await supabase.from('holidays').select('year')
    if (!data) return
    const ys = [...new Set(data.map(r => r.year))].sort((a, b) => b - a)
    setYearList(ys)
    if (!ys.includes(year) && ys.length) setYear(ys[0])
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('holidays').select('*')
      .eq('year', year)
      .order('holiday_date', { ascending: true })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setItems(data || []); setDirty(false); setLoading(false)
  }, [year])

  useEffect(() => { loadYears() }, [])
  useEffect(() => { if (year) { setMsg(null); load() } }, [load])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const change = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val, _dirty: true } : it))
    setDirty(true)
  }

  const handleAdd = () => {
    setItems(prev => [...prev, {
      id: null, year, holiday_date: `${year}-01-01`,
      holiday_name: '', holiday_type: 'NATIONAL', is_system_default: 0, _dirty: true,
    }])
    setDirty(true)
  }

  const handleToggleSystem = (idx, makeSystem) => {
    const it = items[idx]
    if (!makeSystem && it.is_system_default) {
      const ok = window.confirm(
        '이 공휴일을 일반으로 변경하면 시스템에 영향을 미칠 수 있습니다.\n계속하시겠습니까?'
      )
      if (!ok) return
    }
    change(idx, 'is_system_default', makeSystem ? 1 : 0)
  }

  const handleDelete = async (idx) => {
    const it = items[idx]
    if (it.is_system_default) return
    if (it.id !== null) {
      if (!window.confirm('삭제하시겠습니까?')) return
      const { error } = await supabase.from('holidays').delete().eq('id', it.id)
      if (error) { setMsg({ type: 'error', text: error.message }); return }
      await touchSyncMeta()
    }
    setItems(prev => {
      const next = prev.filter((_, i) => i !== idx)
      setDirty(next.some(row => row._dirty))
      return next
    })
  }

  const handleSave = async () => {
    if (savingRef.current) return
    const toSave = items.filter(it => it._dirty)
    if (!toSave.length) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      for (const it of toSave) {
        const { _dirty, id, ...payload } = it
        if (!payload.holiday_name.trim()) continue
        if (id === null) {
          const { error } = await supabase.from('holidays').insert(payload)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        } else {
          const { error } = await supabase.from('holidays').update(payload).eq('id', id)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        }
      }
      await touchSyncMeta()
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
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

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const holTitle   = ['공휴일 업로드 양식 — 행1이 헤더, 행2부터 데이터']
    const holHeaders = ['연도', '날짜', '공휴일명']
    const holSamples = [
      [year, `${year}-01-01`, '신정'],
      [year, `${year}-03-01`, '삼일절'],
      [year, `${year}-05-05`, '어린이날'],
      [year, `${year}-05-06`, '어린이날 대체공휴일'],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([holTitle, holHeaders, ...holSamples]), '공휴일')
    XLSX.writeFile(wb, `공휴일_업로드양식_${year}.xlsx`)
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setMsg(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const { holidays: rows } = parseWorkbook(wb)
      if (!rows.length) { setMsg({ type: 'error', text: 'Excel 파싱 결과가 없습니다. 양식을 확인하세요.' }); setUploading(false); e.target.value = ''; return }
      const yrs = [...new Set(rows.map(r => r.year))]
      for (const yr of yrs) await supabase.from('holidays').delete().eq('year', yr)
      const { error } = await supabase.from('holidays').insert(rows)
      if (error) { setMsg({ type: 'error', text: error.message }); setUploading(false); e.target.value = ''; return }
      await touchSyncMeta()
      setMsg({ type: 'success', text: `공휴일 ${rows.length}건 업로드 완료 (${yrs.join(', ')}년)` })
      load()
    } catch (err) {
      setMsg({ type: 'error', text: 'Excel 읽기 실패: ' + err.message })
    }
    setUploading(false); e.target.value = ''
  }

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>연도:</span>
          <select style={{ ...s.select, width: 90 }} value={year}
            onChange={e => setYear(Number(e.target.value))}>
            {[...new Set([...yearList, year])].sort((a, b) => b - a).map(y => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <span style={s.cnt}>
            <strong style={{ color: '#2563EB' }}>{items.length}</strong>개
            {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={s.btn('ghost')} onClick={downloadTemplate} disabled={saving || uploading}>📥 양식 다운로드</button>
          <button style={s.btn('ghost')} onClick={() => fileRef.current?.click()} disabled={saving || uploading}>
            {uploading ? '업로드 중…' : '📤 Excel 업로드'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleUpload} />
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('success')} onClick={handleAdd} disabled={saving}>+ 공휴일 추가</button>
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
              <th style={s.th}>날짜</th>
              <th style={s.th}>공휴일명</th>
              <th style={{ ...s.th, width: 120 }}>유형</th>
              <th style={{ ...s.th, width: 90, textAlign: 'center' }}>시스템여부</th>
              <th style={{ ...s.th, width: 64, textAlign: 'center' }}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} style={s.empty}>등록된 공휴일이 없습니다.</td></tr>
            ) : items.map((it, idx) => {
              const isSys = !!it.is_system_default
              return (
              <tr key={idx} style={{ background: it._dirty ? 'rgba(37,99,235,.03)' : (isSys ? 'rgba(251,191,36,.04)' : 'transparent'), borderBottom: '1px solid #F1F5F9' }}>
                <td style={s.td}>
                  {isSys ? (
                    <span style={s.codeTag}>{it.holiday_date}</span>
                  ) : (
                    <input style={{ ...s.input, width: 120 }} type="date"
                      value={it.holiday_date || ''}
                      onChange={e => change(idx, 'holiday_date', e.target.value)} />
                  )}
                </td>
                <td style={s.td}>
                  <input style={{ ...s.input, background: isSys ? '#F0F4FF' : '#F8FAFC' }} value={it.holiday_name || ''}
                    onChange={e => change(idx, 'holiday_name', e.target.value)}
                    placeholder="공휴일명" />
                </td>
                <td style={s.td}>
                  {isSys ? (
                    <span style={{ fontSize: 13, color: '#64748B' }}>
                      {{ NATIONAL: '법정공휴일', SUBSTITUTE: '대체공휴일', TEMPORARY: '임시공휴일' }[it.holiday_type] || it.holiday_type}
                    </span>
                  ) : (
                    <select style={s.select} value={it.holiday_type || 'NATIONAL'}
                      onChange={e => change(idx, 'holiday_type', e.target.value)}>
                      <option value="NATIONAL">법정공휴일</option>
                      <option value="SUBSTITUTE">대체공휴일</option>
                      <option value="TEMPORARY">임시공휴일</option>
                    </select>
                  )}
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  <input type="checkbox" checked={isSys}
                    onChange={e => handleToggleSystem(idx, e.target.checked)} />
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  {isSys ? (
                    <span style={{ fontSize: 11, color: '#C0CBDF' }}>잠금</span>
                  ) : (
                    <button style={s.btnDel} onClick={() => handleDelete(idx)}>삭제</button>
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Excel 전체 업로드 모달 ──────────────────────────────────────────────────
// CODE_GROUPS에서 그대로 파생시킨다(2026-09-10) — 예전엔 이 목록을 별도로 하드코딩해뒀는데,
// CODE_GROUPS에 그룹을 추가(부서명 등)해도 여기는 안 바뀌어서 업로드 파싱이 조용히 그 시트를
// 건너뛰는 버그가 있었다(다운로드는 CODE_GROUPS를 쓰는데 업로드는 이 목록을 써서 서로 어긋남).
// 시트명 금지문자 제거는 exportLiveData()의 sheetName 규칙과 동일하게 맞춘다.
const CODE_SHEETS = CODE_GROUPS.map(g => g.label.replace(/[:\\/?*[\]]/g, ''))

function parseWorkbook(wb) {
  const codes = [], insurance = [], tax = [], holidays = [], leaveRates = [], excessRate = [], skipped = []

  for (const sheetName of CODE_SHEETS) {
    if (!wb.SheetNames.includes(sheetName)) continue
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 })
    if (rows.length < 3) continue
    const m = String(rows[0]?.[0] || '').match(/\[([A-Z_]+)\]/)
    if (!m) continue
    const groupCode = m[1]
    const header = rows[1] || []
    const ci = k => header.indexOf(k)
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i]
      const code = String(r[ci('코드')] ?? '').trim()
      const name = String(r[ci('코드명')] ?? '').trim()
      if (!code && !name) continue
      codes.push({
        group_code: groupCode,
        code: code.toUpperCase(),
        name,
        sort_order: Number(r[ci('순서')] || (i - 1) * 10),
        use_yn: r[ci('사용여부')] || 'Y',
        is_system_default: r[ci('시스템기본')] === 'Y' ? 1 : 0,
        taxable_yn: ci('과세여부') >= 0 ? (r[ci('과세여부')] || 'N') : 'N',
        ordinary_yn: ci('통상임금포함') >= 0 ? (r[ci('통상임금포함')] || 'Y') : 'Y',
        // 정산전용/설명/사용처/유사어/메모 — 예전(이 컬럼 추가 이전) 양식으로 업로드해도 깨지지
        // 않도록 컬럼이 없으면 안전한 기본값으로 둔다(정산전용=N, 나머지는 빈 값).
        is_settle_code:  ci('정산전용') >= 0 ? (r[ci('정산전용')] === 'Y' ? 1 : 0) : 0,
        description:     ci('설명')   >= 0 ? (r[ci('설명')]   || null) : null,
        usage_location:  ci('사용처') >= 0 ? (r[ci('사용처')] || null) : null,
        synonyms:        ci('유사어') >= 0 ? (r[ci('유사어')] || null) : null,
        memo:            ci('메모')   >= 0 ? (r[ci('메모')]   || null) : null,
      })
    }
  }

  if (wb.SheetNames.includes('보험요율')) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['보험요율'], { header: 1 })
    // 보험요율 시트는 제목행 없이 1행=헤더, 2행부터=데이터(코드/공휴일 시트와 달리 title 행이 없음) —
    // 예전엔 여기서 rows[1](데이터 첫 행)을 헤더로 잘못 읽어 컬럼 매칭이 전부 실패, 업로드시 보험요율만
    // 항상 0건으로 파싱되던 버그였다(실시간 다운로드→재업로드 라운드트립 검증 중 실제로 재현/확인, 2026-09-04).
    const header = rows[0] || []
    const ci = k => header.indexOf(k)
    const safeN = (v, def = 0) => { const n = Number(v ?? def); return isNaN(n) ? def : n }
    const toYM  = v => { if (!v) return null; return String(v).trim().slice(0, 7) }
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      if (!r[ci('연도')]) continue
      insurance.push({
        year:                safeN(r[ci('연도')]),
        pension_rate:        safeN(r[ci('국민연금(%)')]) / 100,
        pension_upper_limit: safeN(r[ci('연금 상한액(원)')]),
        pension_lower_limit: safeN(r[ci('연금 하한액(원)')]),
        health_rate:         safeN(r[ci('건강보험(%)')]) / 100,
        care_rate:           safeN(r[ci('장기요양(%)')]) / 100,
        employ_rate:         safeN(r[ci('고용보험(%)')]) / 100,
        apply_from:          toYM(r[ci('적용시작')]),
        apply_to:            toYM(r[ci('적용종료')]),
        memo:                r[ci('비고')] || '',
      })
    }
  }

  // 세액표: 신규 양식 (A=적용일자, B=이상(원), C=미만(원), D~N=1인~11인)
  if (wb.SheetNames.includes('세액표')) {
    const rawRows = XLSX.utils.sheet_to_json(wb.Sheets['세액표'], { header: 1 })
    const safeN2 = (v, def = 0) => { const n = Number(v ?? def); return isNaN(n) ? def : n }
    let lastAf = null
    for (let i = 1; i < rawRows.length; i++) {
      const r = rawRows[i]
      const af = xlDateToStr(r[0])
      if (af) lastAf = af
      if (!lastAf) continue
      const rmin = safeN2(r[1], NaN)
      if (isNaN(rmin)) continue
      const rmxRaw = r[2]
      const rmax = (rmxRaw == null || String(rmxRaw).trim() === '') ? null : safeN2(rmxRaw)
      for (let d = 1; d <= 11; d++) {
        tax.push({ apply_from: lastAf, range_min: rmin, range_max: rmax, dependents: d, tax_amount: safeN2(r[2 + d]) })
      }
    }
  }

  // 초과세율: 시트명 '초과세율' (A=적용일자, B=구간시작, C=구간끝, D=누적세액, E=보정비율, F=세율)
  if (wb.SheetNames.includes('초과세율')) {
    const rawRows = XLSX.utils.sheet_to_json(wb.Sheets['초과세율'], { header: 1 })
    const safeN3 = (v, def = 0) => { const n = Number(v ?? def); return isNaN(n) ? def : n }
    for (let i = 1; i < rawRows.length; i++) {
      const r = rawRows[i]
      const af = xlDateToStr(r[0])
      if (!af) continue
      const tf = safeN3(r[1], NaN)
      if (isNaN(tf)) continue
      const ttRaw = r[2]
      const tt = (ttRaw == null || String(ttRaw).trim() === '') ? null : safeN3(ttRaw)
      excessRate.push({ apply_from: af, threshold_from: tf, threshold_to: tt, accumulated: safeN3(r[3]), factor: safeN3(r[4], 0.98), rate: safeN3(r[5]) })
    }
  }

  if (wb.SheetNames.includes('공휴일')) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['공휴일'], { header: 1 })
    const header = rows[1] || []
    const ci = k => header.indexOf(k)
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i]
      if (!r[ci('날짜')]) continue
      const name = String(r[ci('공휴일명')] || '')
      holidays.push({ year: Number(r[ci('연도')]), holiday_date: String(r[ci('날짜')]), holiday_name: name, holiday_type: name.includes('대체') ? 'SUBSTITUTE' : 'NATIONAL' })
    }
  }

  if (wb.SheetNames.includes('출산육아급여기준')) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['출산육아급여기준'], { header: 1 })
    const header = rows[1] || []
    const ci = k => header.indexOf(k)
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i]
      if (!r[ci('year')]) continue
      const safeN3 = (v, def = 0) => { const n = Number(v ?? def); return isNaN(n) ? def : n }
      const peiCap = r[ci('paternity_ei_cap')]
      leaveRates.push({
        year:              safeN3(r[ci('year')]),
        maternity_ei_cap:  safeN3(r[ci('maternity_ei_cap')]),
        paternity_days:    safeN3(r[ci('paternity_days')]),
        paternity_ei_cap:  peiCap != null && peiCap !== '' ? safeN3(peiCap) : null,
        parental_cap_1_3:  safeN3(r[ci('parental_cap_1_3')]),
        parental_cap_4_6:  safeN3(r[ci('parental_cap_4_6')]),
        parental_cap_7p:   safeN3(r[ci('parental_cap_7p')]),
        parental_rate_1_6: safeN3(r[ci('parental_rate_1_6')], 1),
        parental_rate_7p:  safeN3(r[ci('parental_rate_7p')]),
        parental_floor:    safeN3(r[ci('parental_floor')]),
        memo:              r[ci('memo')] || null,
      })
    }
  }

  return { codes, insurance, tax, excessRate, holidays, leaveRates, skipped }
}

function BulkUploadModal({ onClose }) {
  const [preview, setPreview]     = useState(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress]   = useState('')
  const [exporting, setExporting] = useState(false)
  const [msg, setMsg]             = useState(null)
  const [done, setDone]           = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileRef = useRef(null)

  const processFile = async (f) => {
    if (!f) return
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      setPreview(parseWorkbook(wb))
      setMsg(null)
    } catch (err) {
      setMsg({ type: 'error', text: 'Excel 파일 읽기 실패: ' + err.message })
    }
  }
  const handleFile = (e) => processFile(e.target.files?.[0])
  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    processFile(e.dataTransfer.files?.[0])
  }

  // 실시간 데이터 다운로드 — Supabase의 현재 seed 데이터를 그대로 xlsx로 내려받는다.
  // parseWorkbook()이 읽는 시트명/헤더 순서와 정확히 동일하게 맞춰서, 그대로 다시
  // 업로드하면 지금 상태를 그대로 복원(전체 백업/롤백 용도)할 수 있게 한다.
  const exportLiveData = async () => {
    if (exporting) return
    setExporting(true); setMsg(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const wb2 = XLSX.utils.book_new()

      // ── 코드 시트 (파서: 행0=[GROUP_CODE] 시트명, 행1=헤더, 행2+=데이터) ──
      // 정산전용/설명/사용처/유사어/메모는 모든 그룹에 공통으로 끝에 붙인다 — 다운로드→수정→
      // 재업로드를 그대로 반복 사용할 예정이라(2026-09-04, 사용자 확정), seed_codes_smart_hr_plus의
      // 모든 컬럼을 빠짐없이 왕복시켜야 한다. 특히 정산전용(is_settle_code)이 빠지면 재업로드 시
      // 991~999 같은 정산 전용 코드가 초기화되어 스마트HR+ 코드관리 화면에 노출되는 사고로 이어진다.
      setProgress('코드 불러오는 중…')
      const codeBase = ['코드', '코드명', '순서', '사용여부', '시스템기본']
      const codeTax  = [...codeBase, '과세여부']
      const codeOrd  = [...codeTax,  '통상임금포함']
      const codeExtra = ['정산전용', '설명', '사용처', '유사어', '메모']
      const allCodes = await fetchAllRows('seed_codes_smart_hr_plus')
      for (const grp of CODE_GROUPS) {
        const rows = allCodes
          .filter(r => r.group_code === grp.code)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        const headers = [...(grp.hasOrdinary ? codeOrd : grp.hasTaxable ? codeTax : codeBase), ...codeExtra]
        const dataRows = rows.map(r => {
          const row = [r.code, r.name, r.sort_order ?? 0, r.use_yn || 'Y', r.is_system_default ? 'Y' : 'N']
          if (grp.hasTaxable)  row.push(r.taxable_yn || 'N')
          if (grp.hasOrdinary) row.push(r.ordinary_yn || 'Y')
          row.push(r.is_settle_code ? 'Y' : 'N', r.description || '', r.usage_location || '', r.synonyms || '', r.memo || '')
          return row
        })
        // 시트명에 xlsx 금지문자(: \ / ? * [ ])가 들어가면 저장이 실패한다 — 라벨에 '/'가
        // 있는 외출/조퇴구분 그룹에서 실제로 재현됨(2026-09-04). CODE_SHEETS 원래 표기(외출조퇴구분)와
        // 맞추기 위해서라도 제거가 맞다 — parseWorkbook()이 그 이름으로 시트를 찾는다.
        const sheetName = grp.label.replace(/[:\\/?*[\]]/g, '')
        XLSX.utils.book_append_sheet(wb2,
          XLSX.utils.aoa_to_sheet([[`[${grp.code}] ${grp.label}`], headers, ...dataRows]),
          sheetName)
      }

      // ── 보험요율 (파서: 헤더=행0, 데이터=행1+) ── DB는 비율을 소수(0.09)로 저장, 시트는 %(9)로 표기
      // 시트 순서는 이 편집기의 메뉴 순서(MAIN_TABS: 코드→보험요율→최저임금→근로소득세액표→
      // 공휴일→출산육아급여)와 동일하게 맞춘다(2026-09-10). 최저임금은 이 다운로드에 포함되지
      // 않는 항목이라 시트가 없다(기존부터 그랬음, 이번 변경과 무관).
      setProgress('보험요율 불러오는 중…')
      const insRows = await fetchAllRows('insurance_rates', { orderCol: 'year' })
      const insHeaders = ['연도', '국민연금(%)', '연금 상한액(원)', '연금 하한액(원)', '건강보험(%)', '장기요양(%)', '고용보험(%)', '적용시작', '적용종료', '비고']
      const pct = v => Math.round((v ?? 0) * 10000) / 100
      const insData = insRows.map(r => [r.year, pct(r.pension_rate), r.pension_upper_limit, r.pension_lower_limit, pct(r.health_rate), pct(r.care_rate), pct(r.employ_rate), r.apply_from, r.apply_to, r.memo || ''])
      XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([insHeaders, ...insData]), '보험요율')

      // ── 세액표 (파서: 헤더=행0, 데이터=행1+, A=적용일자, B=이상, C=미만, D~N=1~11인) ──
      // (apply_from, range_min, range_max)별로 1~11인 세액을 한 행에 모아 원래 업로드 양식 그대로 맞춘다.
      // 세액표/초과세율은 "근로소득세액표" 메뉴 하나가 두 시트로 쪼개진 경우라 서로 나란히 배치한다.
      setProgress('근로소득세액표 불러오는 중… (수천 건, 시간이 걸릴 수 있습니다)')
      const taxRows = await fetchAllRows('income_tax_table', { orderCol: 'range_min' })
      const taxGroups = new Map()
      for (const r of taxRows) {
        const key = `${r.apply_from}|${r.range_min}|${r.range_max ?? ''}`
        if (!taxGroups.has(key)) taxGroups.set(key, { apply_from: r.apply_from, range_min: r.range_min, range_max: r.range_max, deps: {} })
        taxGroups.get(key).deps[r.dependents] = r.tax_amount
      }
      const taxHeaders = ['적용일자', '이상(원)', '미만(원)', '1인', '2인', '3인', '4인', '5인', '6인', '7인', '8인', '9인', '10인', '11인']
      const taxSorted = [...taxGroups.values()].sort((a, b) =>
        a.apply_from === b.apply_from ? a.range_min - b.range_min : a.apply_from.localeCompare(b.apply_from))
      // 그룹 첫 행에만 적용일자를 채우고 나머지는 비워두던 방식은(재업로드 파서가 빈칸을 직전
      // 값으로 이어받으므로) 파싱상 문제는 없었지만, 매 행에 값이 보이는 편이 다운로드한 파일을
      // 직접 보거나 필터링할 때 더 명확하다는 요청으로 모든 행에 채워서 만든다(2026-09-07).
      const taxData = taxSorted.map(g => [
        g.apply_from,
        g.range_min, g.range_max ?? '',
        ...Array.from({ length: 11 }, (_, d) => g.deps[d + 1] ?? 0),
      ])
      XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([taxHeaders, ...taxData]), '세액표')

      // ── 초과세율 (파서: 헤더=행0, 데이터=행1+, A=적용일자, B=구간시작, C=구간끝, D=누적세액, E=보정비율, F=세율) ──
      setProgress('초과세율표 불러오는 중…')
      const erRows = (await fetchAllRows('income_tax_excess_rate', { orderCol: 'apply_from' }))
        .sort((a, b) => a.apply_from === b.apply_from ? a.threshold_from - b.threshold_from : a.apply_from.localeCompare(b.apply_from))
      const erHeaders = ['적용일자', '구간시작(원) 초과', '구간끝(원) 이하', '누적세액(원)', '보정비율', '세율']
      const erData = erRows.map(r => [r.apply_from, r.threshold_from, r.threshold_to ?? '', r.accumulated, r.factor, r.rate])
      XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([erHeaders, ...erData]), '초과세율')

      // ── 공휴일 (파서: 행0=빈줄, 행1=헤더, 행2+=데이터 / 헤더키: 연도, 날짜, 공휴일명) ──
      setProgress('공휴일 불러오는 중…')
      const holRows = await fetchAllRows('holidays', { orderCol: 'holiday_date' })
      const holTitle   = ['공휴일 현재 데이터 — 행1이 헤더, 행2부터 데이터']
      const holHeaders = ['연도', '날짜', '공휴일명']
      const holData = holRows.map(r => [r.year, r.holiday_date, r.holiday_name])
      XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([holTitle, holHeaders, ...holData]), '공휴일')

      // ── 출산육아급여기준 (파서: 행0=빈줄, 행1=헤더(영문key), 행2+=데이터) ──
      setProgress('출산육아급여기준 불러오는 중…')
      const lrRows = await fetchAllRows('gov_leave_benefit_rates', { orderCol: 'year' })
      const lrTitle   = ['출산육아급여기준 현재 데이터 — 행1이 헤더(영문), 행2부터 데이터']
      const lrHeaders = ['year', 'maternity_ei_cap', 'paternity_days', 'paternity_ei_cap',
                         'parental_cap_1_3', 'parental_cap_4_6', 'parental_cap_7p',
                         'parental_rate_1_6', 'parental_rate_7p', 'parental_floor', 'memo']
      const lrData = lrRows.map(r => [r.year, r.maternity_ei_cap, r.paternity_days, r.paternity_ei_cap ?? '',
        r.parental_cap_1_3, r.parental_cap_4_6, r.parental_cap_7p, r.parental_rate_1_6, r.parental_rate_7p, r.parental_floor, r.memo || ''])
      XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([lrTitle, lrHeaders, ...lrData]), '출산육아급여기준')

      // 스마트HR+ 업로드양식과 동일하게, 다운로드한 파일을 열어 값을 고칠 때 엑셀이 날짜/숫자
      // 서식으로 자동 변환하지 않도록 전체 시트의 채워진 셀에 "텍스트" 서식을 지정한다.
      for (const sheetName of wb2.SheetNames) applyTextFormat(wb2.Sheets[sheetName])

      const ds = today.replace(/-/g, '')
      XLSX.writeFile(wb2, `seed_현재데이터_${ds}.xlsx`)
    } catch (err) {
      setMsg({ type: 'error', text: '데이터 조회 실패: ' + err.message })
    } finally {
      setExporting(false); setProgress('')
    }
  }

  const handleImport = async () => {
    if (!preview || importing) return
    setImporting(true); setMsg(null)
    try {
      if (preview.codes.length) {
        const groups = [...new Set(preview.codes.map(c => c.group_code))]
        for (const gc of groups) {
          setProgress(`코드 [${gc}] 처리 중…`)
          const { error: delErr } = await supabase.from('seed_codes_smart_hr_plus').delete().eq('group_code', gc)
          if (delErr) throw delErr
          const newCodes = preview.codes.filter(c => c.group_code === gc)
          const { error } = await supabase.from('seed_codes_smart_hr_plus').insert(newCodes)
          if (error) throw error
        }
      }
      if (preview.insurance.length) {
        setProgress('보험요율 처리 중…')
        const yrs = [...new Set(preview.insurance.map(r => r.year))]
        for (const yr of yrs) await supabase.from('insurance_rates').delete().eq('year', yr)
        const { error } = await supabase.from('insurance_rates').insert(preview.insurance)
        if (error) throw error
      }
      if (preview.tax.length) {
        const afs = [...new Set(preview.tax.map(r => r.apply_from))]
        for (const af of afs) await supabase.from('income_tax_table').delete().eq('apply_from', af)
        const CHUNK = 500
        for (let i = 0; i < preview.tax.length; i += CHUNK) {
          setProgress(`세액표 처리 중… ${Math.round(i / preview.tax.length * 100)}%`)
          const { error } = await supabase.from('income_tax_table').insert(preview.tax.slice(i, i + CHUNK))
          if (error) throw error
        }
      }
      if (preview.excessRate.length) {
        setProgress('초과세율 처리 중…')
        const afs = [...new Set(preview.excessRate.map(r => r.apply_from))]
        for (const af of afs) await supabase.from('income_tax_excess_rate').delete().eq('apply_from', af)
        const { error } = await supabase.from('income_tax_excess_rate').insert(preview.excessRate)
        if (error) throw error
      }
      if (preview.holidays.length) {
        setProgress('공휴일 처리 중…')
        const yrs = [...new Set(preview.holidays.map(r => r.year))]
        for (const yr of yrs) await supabase.from('holidays').delete().eq('year', yr)
        const { error } = await supabase.from('holidays').insert(preview.holidays)
        if (error) throw error
      }
      if (preview.leaveRates.length) {
        setProgress('출산육아급여기준 처리 중…')
        for (const row of preview.leaveRates) {
          const { error } = await supabase.from('gov_leave_benefit_rates')
            .upsert(row, { onConflict: 'year' })
          if (error) throw error
        }
      }
      await touchSyncMeta()
      setProgress(''); setDone(true)
      setMsg({ type: 'success', text: '전체 업로드 완료!' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
      setProgress('')
    }
    setImporting(false)
  }

  const taxAfs    = preview ? [...new Set(preview.tax.map(r => r.apply_from))].sort().join(', ') : ''
  const holYears  = preview ? [...new Set(preview.holidays.map(r => r.year))].sort().join(', ') : ''
  const insYears  = preview ? preview.insurance.map(r => r.year).join(', ') : ''
  const lrYears   = preview ? preview.leaveRates.map(r => r.year).sort().join(', ') : ''
  const excessAfs = preview ? [...new Set(preview.excessRate.map(r => r.apply_from))].sort().join(', ') : ''

  return (
    <div style={s.popupOverlay} onClick={!importing ? onClose : undefined}>
      <div style={{ ...s.popupDialog, maxWidth: 540, width: '95vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>📦 Excel 전체 업로드</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>seed_현재데이터_*.xlsx 파일로 전체 시드 데이터를 한번에 업로드합니다.</div>
          </div>
          {!importing && <button onClick={onClose} style={s.alertClose}>×</button>}
        </div>

        {!preview ? (
          <div>
            <div onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              style={{ border: '2px dashed', borderColor: dragActive ? '#2563EB' : '#CBD5E1',
                background: dragActive ? '#EFF6FF' : 'transparent',
                borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', color: '#475569', transition: 'border-color .15s, background .15s' }}
              onMouseEnter={e => { if (!dragActive) e.currentTarget.style.borderColor = '#93C5FD' }}
              onMouseLeave={e => { if (!dragActive) e.currentTarget.style.borderColor = '#CBD5E1' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Excel 파일을 선택하거나 끌어다 놓으세요</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>seed_현재데이터_YYYYMMDD.xlsx</div>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFile} />
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
              {exporting && <span style={{ fontSize: 12, color: '#2563EB' }}>{progress || '불러오는 중…'}</span>}
              <button style={{ ...s.btn('ghost'), fontSize: 12 }} onClick={exportLiveData} disabled={exporting}>
                {exporting ? '⏳ 다운로드 중…' : '📥 현재 데이터 다운로드'}
              </button>
            </div>
            {msg && <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), marginTop: 12 }}>{msg.text}</div>}
          </div>
        ) : (
          <div>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>업로드 예정 데이터</div>
              {[
                ['코드', `${preview.codes.length}건 (${[...new Set(preview.codes.map(c => c.group_code))].length}개 그룹)`],
                ['보험요율', `${preview.insurance.length}건 (${insYears}년)`],
                ['간이세액표', `${preview.tax.length}건 (${taxAfs})`],
                ...(preview.excessRate.length ? [['초과세율', `${preview.excessRate.length}건 (${excessAfs})`]] : []),
                ['공휴일', `${preview.holidays.length}건 (${holYears}년)`],
                ...(preview.leaveRates.length ? [['출산육아급여기준', `${preview.leaveRates.length}건 (${lrYears}년)`]] : []),
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ color: '#475569' }}>{k}</span>
                  <span style={{ fontWeight: 600, color: '#1E293B' }}>{v}</span>
                </div>
              ))}
              {preview.skipped.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#94A3B8' }}>건너뜀: {preview.skipped.join(' / ')}</div>
              )}
            </div>
            <div style={{ padding: '8px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 6, fontSize: 12, color: '#9A3412', marginBottom: 16 }}>
              ⚠️ 코드: 업로드 파일에 포함된 그룹은 기존 코드 전체 삭제 후 파일 내용으로 대체 (파일에 없는
              코드·사용자추가코드도 함께 삭제, 되돌릴 수 없음)<br/>
              ⚠️ 보험요율·간이세액표·초과세율·공휴일: 해당 시행일 데이터 삭제 후 대체 (되돌릴 수 없음)
            </div>
            {msg && <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), marginBottom: 12 }}>{msg.text}</div>}
            {progress && <div style={{ fontSize: 12, color: '#2563EB', marginBottom: 8, textAlign: 'center' }}>{progress}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {!done && <button style={s.btn('ghost')} onClick={() => setPreview(null)} disabled={importing}>다시 선택</button>}
              {!done
                ? <button style={s.btn('primary')} onClick={handleImport} disabled={importing}>
                    {importing ? '업로드 중…' : '업로드'}
                  </button>
                : <button style={s.btn('primary')} onClick={onClose}>닫기</button>
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 출산육아급여기준 탭 ─────────────────────────────────────────────────────
function LeaveRateTab({ onDirtyChange }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [dirty,   setDirty]   = useState(false)
  const [msg,     setMsg]     = useState(null)
  const savingRef = useRef(false) // 저장 버튼 연타 방지(2026-09-04, CodeTab과 동일한 이유)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('gov_leave_benefit_rates').select('*').order('year', { ascending: false })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setItems(data || []); setDirty(false); setLoading(false)
  }
  useEffect(() => { setMsg(null); load() }, [])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

  const change = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val, _dirty: true } : it))
    setDirty(true)
  }

  const handleAdd = () => {
    setItems(prev => [...prev, {
      id: null, year: new Date().getFullYear(),
      maternity_ei_cap: 0, paternity_days: 0, paternity_ei_cap: null,
      parental_cap_1_3: 0, parental_cap_4_6: 0, parental_cap_7p: 0,
      parental_rate_1_6: 1.0, parental_rate_7p: 0.8, parental_floor: 0,
      memo: '', _dirty: true,
    }])
    setDirty(true)
  }

  const handleDelete = async (idx) => {
    const it = items[idx]
    if (it.id !== null) {
      if (!window.confirm(`${it.year}년 출산육아급여기준을 삭제하시겠습니까?`)) return
      const { error } = await supabase.from('gov_leave_benefit_rates').delete().eq('id', it.id)
      if (error) { setMsg({ type: 'error', text: error.message }); return }
      await touchSyncMeta()
    }
    setItems(prev => {
      const next = prev.filter((_, i) => i !== idx)
      setDirty(next.some(row => row._dirty))
      return next
    })
  }

  const handleSave = async () => {
    if (savingRef.current) return
    const toSave = items.filter(it => it._dirty)
    if (!toSave.length) return
    savingRef.current = true
    try {
      setSaving(true); setMsg(null)
      for (const it of toSave) {
        const { _dirty, id, ...payload } = it
        if (id === null) {
          const { error } = await supabase.from('gov_leave_benefit_rates').insert(payload)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        } else {
          const { error } = await supabase.from('gov_leave_benefit_rates').update(payload).eq('id', id)
          if (error) { setMsg({ type: 'error', text: error.message }); return }
        }
      }
      await touchSyncMeta()
      setMsg({ type: 'success', text: '정상적으로 저장되었습니다.' })
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

  const fmtAmt = v => (v != null && v !== '') ? Number(v).toLocaleString('ko-KR') : ''
  const parseAmt = v => { const n = Number(String(v).replace(/,/g, '')); return isNaN(n) ? null : n }

  return (
    <div style={s.card}>
      <div style={s.toolbar}>
        <span style={s.cnt}>
          총 <strong style={{ color: '#2563EB' }}>{items.length}</strong>건
          {dirty && <span style={{ color: '#DC2626', marginLeft: 8 }}>● 미저장</span>}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('success')} onClick={handleAdd} disabled={saving}>+ 연도 추가</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      <MsgModal msg={msg} onClose={() => setMsg(null)} />
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>
        ※ 급여율은 % 단위 (예: 100 = 100%, 80 = 80%) · 상한/하한은 월 원 단위
      </div>
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: 90 }}>연도</th>
                <th style={{ ...s.th, width: 110, textAlign: 'right' }}>출산전후휴가<br/>급여상한(원)</th>
                <th style={{ ...s.th, width: 90, textAlign: 'center' }}>배우자<br/>휴가일수</th>
                <th style={{ ...s.th, width: 110, textAlign: 'right' }}>배우자휴가<br/>급여상한(원)</th>
                <th style={{ ...s.th, width: 110, textAlign: 'right' }}>육아휴직<br/>상한 1~3월</th>
                <th style={{ ...s.th, width: 110, textAlign: 'right' }}>육아휴직<br/>상한 4~6월</th>
                <th style={{ ...s.th, width: 110, textAlign: 'right' }}>육아휴직<br/>상한 7월~</th>
                <th style={{ ...s.th, width: 90, textAlign: 'center' }}>급여율<br/>1~6월(%)</th>
                <th style={{ ...s.th, width: 90, textAlign: 'center' }}>급여율<br/>7월~(%)</th>
                <th style={{ ...s.th, width: 100, textAlign: 'right' }}>하한액(원)</th>
                <th style={s.th}>비고</th>
                <th style={{ ...s.th, width: 50, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} style={{ background: it._dirty ? 'rgba(37,99,235,.03)' : 'transparent', borderBottom: '1px solid #F1F5F9' }}>
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 78, textAlign: 'center' }}
                      type="text" inputMode="numeric" value={it.year}
                      onChange={e => change(idx, 'year', Number(e.target.value))} />
                  </td>
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 110, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      type="text" value={fmtAmt(it.maternity_ei_cap)}
                      onChange={e => change(idx, 'maternity_ei_cap', parseAmt(e.target.value))} />
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <input style={{ ...s.input, width: 60, textAlign: 'center' }}
                      type="text" inputMode="numeric" value={it.paternity_days ?? ''}
                      onChange={e => change(idx, 'paternity_days', e.target.value === '' ? null : Number(e.target.value))} />
                  </td>
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 110, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      type="text" value={fmtAmt(it.paternity_ei_cap)}
                      placeholder="미정"
                      onChange={e => change(idx, 'paternity_ei_cap', e.target.value === '' ? null : parseAmt(e.target.value))} />
                  </td>
                  {['parental_cap_1_3', 'parental_cap_4_6', 'parental_cap_7p'].map(key => (
                    <td key={key} style={s.td}>
                      <input style={{ ...s.input, width: 110, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                        type="text" value={fmtAmt(it[key])}
                        onChange={e => change(idx, key, parseAmt(e.target.value))} />
                    </td>
                  ))}
                  {['parental_rate_1_6', 'parental_rate_7p'].map(key => (
                    <td key={key} style={{ ...s.td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                        <input style={{ ...s.input, width: 56, textAlign: 'right' }}
                          type="text" inputMode="numeric" value={it[key] != null ? (Number(it[key]) * 100).toFixed(0) : ''}
                          onChange={e => change(idx, key, e.target.value === '' ? null : Number(e.target.value) / 100)} />
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>%</span>
                      </div>
                    </td>
                  ))}
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 100, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      type="text" value={fmtAmt(it.parental_floor)}
                      onChange={e => change(idx, 'parental_floor', parseAmt(e.target.value))} />
                  </td>
                  <td style={s.td}>
                    <input style={s.input} value={it.memo || ''}
                      onChange={e => change(idx, 'memo', e.target.value)}
                      placeholder="비고" />
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <button style={s.btnDel} onClick={() => handleDelete(idx)}>삭제</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={12} style={s.empty}>등록된 출산육아급여기준이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── 스타일 ──────────────────────────────────────────────────────────────────
const s = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: '#1E293B', marginBottom: 6 },
  desc:      { fontSize: 13, color: '#94A3B8', marginBottom: 20 },

  mainTabs: { display: 'flex', gap: 4, marginBottom: 20 },
  mainTab:  {
    padding: '9px 20px', border: 'none', background: 'transparent',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#64748B',
    borderBottom: '2px solid transparent', fontFamily: 'inherit',
    transition: 'color .15s',
  },
  mainTabActive: { color: '#2563EB', borderBottom: '2px solid #2563EB' },

  groupSidebar: {
    width: 130, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2,
    borderRight: '1px solid #E2E8F0', paddingRight: 12, marginRight: 16,
  },
  groupBtn: {
    padding: '8px 12px', border: 'none', borderRadius: 8,
    background: 'transparent', fontSize: 13, cursor: 'pointer', color: '#475569',
    textAlign: 'left', fontFamily: 'inherit', fontWeight: 500,
    transition: 'all .12s',
  },
  groupBtnActive: { background: '#EFF6FF', boxShadow: 'inset 0 0 0 1.5px #93C5FD', color: '#2563EB', fontWeight: 700 },

  card: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.06)' },

  toolbar: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
    justifyContent: 'space-between',
  },
  cnt:  { fontSize: 13, color: '#475569' },
  btn: (v) => ({
    padding: '7px 14px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
    ...(v === 'primary' ? { background: '#2563EB', color: '#fff' } :
        v === 'success' ? { background: '#16A34A', color: '#fff' } :
                          { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }),
  }),

  alert: { padding: '8px 14px', borderRadius: 8, fontSize: 13, marginBottom: 10 },
  alertOk:    { background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D' },
  alertError: { background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' },
  alertClose: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', color: 'inherit', opacity: 0.5, flexShrink: 0 },
  msgModalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(15,20,40,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
  },
  msgModalBox: {
    background: '#fff', borderRadius: 14, padding: '30px 36px',
    minWidth: 300, maxWidth: 440, textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  msgModalBoxOk:    { border: '2px solid #BBF7D0' },
  msgModalBoxError: { border: '2px solid #FECACA' },
  msgModalIcon: { fontSize: 34, marginBottom: 10 },
  msgModalText: { fontSize: 15, fontWeight: 600, color: '#1A2340', marginBottom: 20, lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  msgModalBtn: {
    padding: '9px 28px', background: '#2563EB', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  notice: {
    marginTop: 14, padding: '9px 14px', background: '#F8FAFC',
    border: '1px solid #E2E8F0', borderRadius: 8,
    fontSize: 12, color: '#64748B', lineHeight: 1.6,
  },
  helpBox: {
    marginBottom: 14, padding: '14px 16px', background: '#EFF6FF',
    border: '1px solid #BFDBFE', borderRadius: 10,
    fontSize: 13, color: '#334155', lineHeight: 1.65,
  },
  helpTitle: { fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 8 },
  helpP: { margin: '0 0 8px' },
  helpUl: { margin: '0 0 8px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 },

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
  select: {
    padding: '5px 8px', border: '1.5px solid #E2E8F0', borderRadius: 6,
    fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', background: '#fff',
  },

  codeTag: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: '#F1F5F9', padding: '2px 8px', borderRadius: 6,
    fontSize: 11, color: '#475569', fontFamily: 'monospace',
  },
  sysBadge: {
    fontSize: 9, fontWeight: 700, background: '#FFF3D4', color: '#D4820A',
    border: '1px solid #F0C060', borderRadius: 4, padding: '1px 5px',
  },
  toggleBtn: {
    padding: '3px 10px', color: '#fff', border: 'none', borderRadius: 20,
    cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
  },
  arrowBtn: {
    padding: '2px 6px', border: '1px solid #E2E8F0', borderRadius: 4,
    background: '#F8FAFC', cursor: 'pointer', fontSize: 10, lineHeight: 1,
  },
  btnDel: {
    padding: '4px 10px', background: '#EF4444', color: '#fff',
    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  popupOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  popupDialog: {
    background: '#fff', borderRadius: 12, padding: 24,
    boxShadow: '0 8px 32px rgba(0,0,0,.18)', minWidth: 400, maxWidth: '95vw',
  },
}
