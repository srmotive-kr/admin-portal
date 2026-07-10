import { useEffect, useState, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'

// ─── 코드 그룹 정의 ───────────────────────────────────────────────────────
const CODE_GROUPS = [
  { code: 'RANK',          label: '직책명',         hasTaxable: false, hasOrdinary: false },
  { code: 'POS',           label: '직위명',         hasTaxable: false, hasOrdinary: false },
  { code: 'EMP_TYPE',      label: '고용형태구분',   hasTaxable: false, hasOrdinary: false },
  { code: 'JOB',           label: '업무구분',       hasTaxable: false, hasOrdinary: false },
  { code: 'SALARY_TYPE',   label: '급여구분',       hasTaxable: false, hasOrdinary: false },
  { code: 'ALLOWANCE',     label: '수당구분',       hasTaxable: true,  hasOrdinary: true  },
  { code: 'BONUS_TYPE',    label: '상여금구분',     hasTaxable: false, hasOrdinary: false },
  { code: 'LEAVE_TYPE',    label: '휴가구분',       hasTaxable: true,  taxableLabel: '유급여부', hasOrdinary: false },
  { code: 'OUTING_TYPE',   label: '외출/조퇴구분',  hasTaxable: true,  taxableLabel: '유급여부', hasOrdinary: false },
  { code: 'ASSIGN_TYPE',   label: '발령구분',       hasTaxable: false, hasOrdinary: false },
  { code: 'RESIGN_REASON', label: '퇴직사유',       hasTaxable: false, hasOrdinary: false },
  { code: 'SEVERANCE_TYPE',label: '퇴직금구분',     hasTaxable: false, hasOrdinary: false },
]

const MAIN_TABS = ['코드', '보험요율', '세액표', '공휴일', '출산육아급여']

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
            onClick={() => setMainTab(t)}>{t}</button>
        ))}
      </div>

      {mainTab === '코드' && (
        <CodeTab groupCode={groupCode} onGroupChange={setGroupCode} />
      )}
      {mainTab === '보험요율'   && <InsuranceTab />}
      {mainTab === '세액표'     && <TaxTab />}
      {mainTab === '공휴일'     && <HolidayTab />}
      {mainTab === '출산육아급여' && <LeaveRateTab />}
    </div>
  )
}

// ─── 코드 탭 ────────────────────────────────────────────────────────────────
function CodeTab({ groupCode, onGroupChange }) {
  const grp          = CODE_GROUPS.find(g => g.code === groupCode)
  const [items, setItems]     = useState([])
  const [dirty, setDirty]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setMsg(null)
    const { data, error } = await supabase
      .from('seed_codes').select('*')
      .eq('group_code', groupCode)
      .order('sort_order', { ascending: true })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setItems((data || []).map(r => ({
      ...r,
      taxable_yn:        r.taxable_yn        ?? 'N',
      ordinary_yn:       r.ordinary_yn       ?? 'Y',
      is_system_default: r.is_system_default ?? 0,
    })))
    setDirty(false)
    setLoading(false)
  }, [groupCode])

  useEffect(() => { load() }, [load])

  const change = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val, _dirty: true } : it))
    setDirty(true)
  }

  const handleAdd = () => {
    const maxOrder = items.length ? Math.max(...items.map(it => it.sort_order || 0)) + 10 : 10
    setItems(prev => [...prev, {
      id: null, group_code: groupCode, code: '', name: '',
      taxable_yn: 'N', ordinary_yn: 'Y', is_system_default: 0,
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

  const handleDelete = async (idx) => {
    const it = items[idx]
    if (it.is_system_default) return
    if (it.id !== null) {
      if (!window.confirm('삭제하시겠습니까?')) return
      const { error } = await supabase.from('seed_codes').delete().eq('id', it.id)
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
        group_code:        it.group_code,
        code:              (it.code || '').toUpperCase().trim(),
        name:              (it.name || '').trim(),
        sort_order:        it.sort_order,
        use_yn:            it.use_yn,
        taxable_yn:        it.taxable_yn,
        ordinary_yn:       it.ordinary_yn,
        is_system_default: it.is_system_default || 0,
      }
      if (!payload.name) continue
      if (it.id === null) {
        const { error } = await supabase.from('seed_codes').insert(payload)
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      } else {
        const { error } = await supabase.from('seed_codes').update(payload).eq('id', it.id)
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      }
    }
    setMsg({ type: 'success', text: '저장 완료' })
    setSaving(false)
    load()
  }

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {/* 그룹 사이드바 */}
      <div style={s.groupSidebar}>
        {CODE_GROUPS.map(g => (
          <button key={g.code}
            style={{ ...s.groupBtn, ...(groupCode === g.code ? s.groupBtnActive : {}) }}
            onClick={() => onGroupChange(g.code)}>
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

        {msg && (
          <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} style={s.alertClose}>×</button>
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
                  {grp?.hasTaxable && (
                    <th style={{ ...s.th, width: 80, textAlign: 'center' }}>
                      {grp.taxableLabel || '과세여부'}
                    </th>
                  )}
                  {grp?.hasOrdinary && (
                    <th style={{ ...s.th, width: 120, textAlign: 'center' }}>통상임금</th>
                  )}
                  <th style={{ ...s.th, width: 64, textAlign: 'center' }}>이동</th>
                  <th style={{ ...s.th, width: 56, textAlign: 'center' }}>삭제</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={9} style={s.empty}>등록된 데이터가 없습니다.</td></tr>
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
                        ) : it.id === null ? (
                          <input style={{ ...s.input, fontFamily: 'monospace', width: 80 }}
                            value={it.code}
                            onChange={e => change(idx, 'code', e.target.value.toUpperCase())}
                            placeholder="코드" maxLength={10} />
                        ) : (
                          <span style={s.codeTag}>{it.code || '자동'}</span>
                        )}
                      </td>
                      <td style={s.td}>
                        <input style={{ ...s.input, background: isSys ? '#F0F4FF' : '#F8FAFC' }}
                          value={it.name}
                          onChange={e => change(idx, 'name', e.target.value)}
                          placeholder="코드명 입력" />
                      </td>
                      {grp?.hasTaxable && (() => {
                        const isPaid = it.taxable_yn === 'Y'
                        return (
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            {isSys ? (
                              <span style={{ fontSize: 13, color: isPaid ? '#16A34A' : '#94A3B8' }}>
                                {isPaid ? '유급' : '무급'}
                              </span>
                            ) : (
                              <input type="checkbox" checked={isPaid}
                                onChange={e => change(idx, 'taxable_yn', e.target.checked ? 'Y' : 'N')} />
                            )}
                          </td>
                        )
                      })()}
                      {grp?.hasOrdinary && (() => {
                        const isOrd = (it.ordinary_yn ?? 'Y') === 'Y'
                        return (
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            {it.id !== null ? (
                              <span style={{
                                display: 'inline-block', fontSize: 11, fontWeight: 600,
                                padding: '2px 8px', borderRadius: 10,
                                background: isOrd ? '#E8F5E9' : '#FFF3E0',
                                color:      isOrd ? '#2E7D32' : '#9E6700',
                                border:     `1px solid ${isOrd ? '#C8E6C9' : '#FFCC80'}`,
                              }}>
                                {isOrd ? '통상포함' : '통상미포함'}
                              </span>
                            ) : (
                              <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                {['Y', 'N'].map(v => (
                                  <button key={v} style={{
                                    padding: '2px 7px', fontSize: 10, fontWeight: 600,
                                    border: '1px solid', borderRadius: 8, cursor: 'pointer',
                                    background: (it.ordinary_yn ?? 'Y') === v ? (v === 'Y' ? '#2E7D32' : '#9E6700') : '#fff',
                                    color:      (it.ordinary_yn ?? 'Y') === v ? '#fff' : '#94A3B8',
                                    borderColor:(it.ordinary_yn ?? 'Y') === v ? (v === 'Y' ? '#2E7D32' : '#9E6700') : '#E2E8F0',
                                  }} onClick={() => change(idx, 'ordinary_yn', v)}>
                                    {v === 'Y' ? '통상포함' : '통상미포함'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                        )
                      })()}
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
      </div>
    </div>
  )
}

// ─── 보험요율 탭 ──────────────────────────────────────────────────────────────
function InsuranceTab() {
  const [items, setItems]     = useState([])
  const [dirty, setDirty]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  const load = async () => {
    setLoading(true); setMsg(null)
    const { data, error } = await supabase.from('insurance_rates').select('*').order('year', { ascending: false })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setItems(data || []); setDirty(false); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const change = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val, _dirty: true } : it))
    setDirty(true)
  }

  const handleAdd = () => {
    setItems(prev => [...prev, {
      id: null, year: new Date().getFullYear(),
      pension_rate: 0.09, health_rate: 0.0709, care_rate: 0.1295, employ_rate: 0.018,
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
    }
    setItems(prev => prev.filter((_, i) => i !== idx))
    setDirty(true)
  }

  const handleSave = async () => {
    const toSave = items.filter(it => it._dirty)
    if (!toSave.length) return
    setSaving(true); setMsg(null)
    for (const it of toSave) {
      const { _dirty, id, ...payload } = it
      if (id === null) {
        const { error } = await supabase.from('insurance_rates').insert(payload)
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      } else {
        const { error } = await supabase.from('insurance_rates').update(payload).eq('id', id)
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      }
    }
    setMsg({ type: 'success', text: '저장 완료' })
    setSaving(false); load()
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
      {msg && <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span>{msg.text}</span><button onClick={() => setMsg(null)} style={s.alertClose}>×</button></div>}
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: 80 }}>연도</th>
                <th style={{ ...s.th, width: 150, textAlign: 'center' }}>국민연금</th>
                <th style={{ ...s.th, width: 150, textAlign: 'center' }}>건강보험</th>
                <th style={{ ...s.th, width: 150, textAlign: 'center' }}>장기요양</th>
                <th style={{ ...s.th, width: 150, textAlign: 'center' }}>고용보험</th>
                <th style={{ ...s.th, width: 100 }}>적용시작</th>
                <th style={{ ...s.th, width: 100 }}>적용종료</th>
                <th style={s.th}>비고</th>
                <th style={{ ...s.th, width: 64, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} style={{ background: it._dirty ? 'rgba(37,99,235,.03)' : 'transparent', borderBottom: '1px solid #F1F5F9' }}>
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 68, textAlign: 'center' }}
                      type="number" value={it.year}
                      onChange={e => change(idx, 'year', Number(e.target.value))} />
                  </td>
                  {['pension_rate','health_rate','care_rate','employ_rate'].map(key => (
                    <td key={key} style={{ ...s.td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                        <input style={{ ...s.input, width: 70, textAlign: 'right' }}
                          type="number" step="0.0001" value={parseFloat((Number(it[key] || 0) * 100).toFixed(4))}
                          onChange={e => change(idx, key, Number(e.target.value) / 100)} />
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>%</span>
                      </div>
                    </td>
                  ))}
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 90 }} type="month"
                      value={it.apply_from ? it.apply_from.slice(0, 7) : ''}
                      onChange={e => change(idx, 'apply_from', e.target.value || null)} />
                  </td>
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 90 }} type="month"
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
                <tr><td colSpan={9} style={s.empty}>등록된 보험요율이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── 세액표 탭 ──────────────────────────────────────────────────────────────
function TaxTab() {
  const [years, setYears]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [msg, setMsg]             = useState(null)
  const [popup, setPopup]         = useState(null)   // null | { year, rows }
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const load = async () => {
    setLoading(true); setMsg(null)
    // 전체 연도 목록 (최대 10만행으로 limit 높여서 year 필드만 조회)
    const { data: rawYears, error } = await supabase
      .from('income_tax_table').select('year').limit(200000)
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    const counts = {}
    for (const r of rawYears || []) counts[r.year] = (counts[r.year] || 0) + 1
    // limit을 넘는 연도는 정확한 카운트를 별도 요청
    const distinctYears = Object.keys(counts).map(Number).sort((a, b) => b - a)
    const yearList = []
    for (const yr of distinctYears) {
      const { count: exact } = await supabase
        .from('income_tax_table')
        .select('*', { count: 'exact', head: true })
        .eq('year', yr)
      yearList.push({ year: yr, count: exact ?? counts[yr] })
    }
    setYears(yearList)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const handleDelete = async (year) => {
    if (!window.confirm(`${year}년 세액표 전체(${years.find(y => y.year === year)?.count || 0}건)를 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('income_tax_table').delete().eq('year', year)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    load()
  }

  const handleRowClick = async (year) => {
    setPopup({ year, rows: null })
    try {
      const BATCH = 1000
      let allData = [], from = 0
      while (true) {
        const { data, error } = await supabase
          .from('income_tax_table')
          .select('range_min,range_max,dependents,tax_amount')
          .eq('year', year)
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
        const key = `${r.range_min}-${r.range_max}`
        if (!map.has(key)) map.set(key, { range_min: r.range_min, range_max: r.range_max })
        map.get(key)[`dep_${r.dependents}`] = r.tax_amount
      }
      setPopup({ year, rows: [...map.values()] })
    } catch (err) {
      setMsg({ type: 'error', text: err.message }); setPopup(null)
    }
  }

  const downloadTemplate = () => {
    const header = 'range_min,range_max,dep_1,dep_2,dep_3,dep_4,dep_5,dep_6,dep_7,dep_8,dep_9,dep_10,dep_11'
    const sample = '770000,775000,0,0,0,0,0,0,0,0,0,0,0\n775000,780000,19220,0,0,0,0,0,0,0,0,0,0'
    const blob = new Blob(['﻿' + header + '\n' + sample], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = '세액표_업로드양식.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const yearStr = window.prompt('업로드할 연도를 입력하세요 (예: 2026):', String(new Date().getFullYear()))
    if (!yearStr) { e.target.value = ''; return }
    const yr = Number(yearStr)
    if (!yr || yr < 2000 || yr > 2100) { setMsg({ type: 'error', text: '올바른 연도를 입력하세요.' }); e.target.value = ''; return }
    setUploading(true); setMsg(null)
    const text = await file.text()
    const lines = text.replace(/\r/g, '').trim().split('\n')
    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',')
      if (vals.length < 13) continue
      const range_min = Number(vals[0]); const range_max = Number(vals[1])
      for (let d = 1; d <= 11; d++) {
        const v = vals[d + 1]?.trim()
        rows.push({ year: yr, range_min, range_max, dependents: d, tax_amount: (!v || v === '-' ? 0 : Number(v)) })
      }
    }
    if (!rows.length) { setMsg({ type: 'error', text: 'CSV 파싱 결과가 없습니다. 양식을 확인하세요.' }); setUploading(false); e.target.value = ''; return }
    await supabase.from('income_tax_table').delete().eq('year', yr)
    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('income_tax_table').insert(rows.slice(i, i + CHUNK))
      if (error) { setMsg({ type: 'error', text: error.message }); setUploading(false); e.target.value = ''; return }
    }
    setMsg({ type: 'success', text: `${yr}년 세액표 ${rows.length}건 업로드 완료` })
    setUploading(false); load(); e.target.value = ''
  }

  return (
    <div style={s.card}>
      {popup && (
        <div style={s.popupOverlay} onClick={() => setPopup(null)}>
          <div style={s.popupDialog} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1E293B' }}>
                {popup.year}년 근로소득 간이세액표
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
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.range_max?.toLocaleString()}</td>
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
        <span style={s.cnt}>총 <strong style={{ color: '#2563EB' }}>{years.length}</strong>개 연도</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={s.btn('ghost')} onClick={load}>↺ 새로고침</button>
          <button style={s.btn('ghost')} onClick={downloadTemplate}>📥 양식 다운로드</button>
          <button style={s.btn('success')} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? '업로드 중…' : '📤 CSV 업로드'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUpload} />
        </div>
      </div>
      {msg && <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span>{msg.text}</span><button onClick={() => setMsg(null)} style={s.alertClose}>×</button></div>}
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 100 }}>연도</th>
              <th style={{ ...s.th, width: 120 }}>데이터 수</th>
              <th style={s.th}>설명</th>
              <th style={{ ...s.th, width: 64, textAlign: 'center' }}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {years.length === 0 ? (
              <tr><td colSpan={4} style={s.empty}>등록된 세액표가 없습니다.</td></tr>
            ) : years.map(({ year, count }) => (
              <tr key={year} style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                onClick={() => handleRowClick(year)}>
                <td style={{ ...s.td, fontWeight: 700 }}>{year}년</td>
                <td style={s.td}>{count.toLocaleString()}건</td>
                <td style={{ ...s.td, color: '#64748B', fontSize: 12 }}>국세청 근로소득 간이세액표 {year}년 기준 — 클릭하면 내역 조회</td>
                <td style={{ ...s.td, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                  <button style={s.btnDel} onClick={() => handleDelete(year)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── 공휴일 탭 ──────────────────────────────────────────────────────────────
function HolidayTab() {
  const [year, setYear]         = useState(new Date().getFullYear())
  const [items, setItems]       = useState([])
  const [dirty, setDirty]       = useState(false)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState(null)
  const [yearList, setYearList] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const loadYears = async () => {
    const { data } = await supabase.from('holidays').select('year')
    if (!data) return
    const ys = [...new Set(data.map(r => r.year))].sort((a, b) => b - a)
    setYearList(ys)
    if (!ys.includes(year) && ys.length) setYear(ys[0])
  }

  const load = useCallback(async () => {
    setLoading(true); setMsg(null)
    const { data, error } = await supabase
      .from('holidays').select('*')
      .eq('year', year)
      .order('holiday_date', { ascending: true })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setItems(data || []); setDirty(false); setLoading(false)
  }, [year])

  useEffect(() => { loadYears() }, [])
  useEffect(() => { if (year) load() }, [load])

  const change = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val, _dirty: true } : it))
    setDirty(true)
  }

  const handleAdd = () => {
    setItems(prev => [...prev, {
      id: null, year, holiday_date: `${year}-01-01`,
      holiday_name: '', holiday_type: 'NATIONAL', _dirty: true,
    }])
    setDirty(true)
  }

  const handleDelete = async (idx) => {
    const it = items[idx]
    if (it.id !== null) {
      if (!window.confirm('삭제하시겠습니까?')) return
      const { error } = await supabase.from('holidays').delete().eq('id', it.id)
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
      const { _dirty, id, ...payload } = it
      if (!payload.holiday_name.trim()) continue
      if (id === null) {
        const { error } = await supabase.from('holidays').insert(payload)
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      } else {
        const { error } = await supabase.from('holidays').update(payload).eq('id', id)
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      }
    }
    setMsg({ type: 'success', text: '저장 완료' })
    setSaving(false); load()
  }

  const downloadTemplate = () => {
    const rows = [
      '# holiday_type: NATIONAL=법정공휴일 / SUBSTITUTE=대체공휴일',
      'holiday_date,holiday_name,holiday_type',
      `${year}-01-01,신정,NATIONAL`,
      `${year}-03-01,삼일절,NATIONAL`,
      `${year}-05-05,어린이날,NATIONAL`,
      `${year}-05-06,어린이날 대체공휴일,SUBSTITUTE`,
    ].join('\n')
    const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `공휴일_업로드양식_${year}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setMsg(null)
    const text = await file.text()
    const lines = text.replace(/\r/g, '').trim().split('\n')
    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line || line.startsWith('#')) continue
      const [date, name, type] = line.split(',').map(v => v.trim())
      if (!date || !name) continue
      rows.push({ year, holiday_date: date, holiday_name: name, holiday_type: type || 'NATIONAL' })
    }
    if (!rows.length) { setMsg({ type: 'error', text: 'CSV 파싱 결과가 없습니다. 양식을 확인하세요.' }); setUploading(false); e.target.value = ''; return }
    await supabase.from('holidays').delete().eq('year', year)
    const { error } = await supabase.from('holidays').insert(rows)
    if (error) { setMsg({ type: 'error', text: error.message }); setUploading(false); e.target.value = ''; return }
    setMsg({ type: 'success', text: `${year}년 공휴일 ${rows.length}건 업로드 완료` })
    setUploading(false); load(); e.target.value = ''
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
            {uploading ? '업로드 중…' : '📤 CSV 업로드'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUpload} />
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('success')} onClick={handleAdd} disabled={saving}>+ 공휴일 추가</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      {msg && <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span>{msg.text}</span><button onClick={() => setMsg(null)} style={s.alertClose}>×</button></div>}
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>날짜</th>
              <th style={s.th}>공휴일명</th>
              <th style={{ ...s.th, width: 120 }}>유형</th>
              <th style={{ ...s.th, width: 64, textAlign: 'center' }}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={4} style={s.empty}>등록된 공휴일이 없습니다.</td></tr>
            ) : items.map((it, idx) => (
              <tr key={idx} style={{ background: it._dirty ? 'rgba(37,99,235,.03)' : 'transparent', borderBottom: '1px solid #F1F5F9' }}>
                <td style={s.td}>
                  <input style={{ ...s.input, width: 120 }} type="date"
                    value={it.holiday_date || ''}
                    onChange={e => change(idx, 'holiday_date', e.target.value)} />
                </td>
                <td style={s.td}>
                  <input style={s.input} value={it.holiday_name || ''}
                    onChange={e => change(idx, 'holiday_name', e.target.value)}
                    placeholder="공휴일명" />
                </td>
                <td style={s.td}>
                  <select style={s.select} value={it.holiday_type || 'NATIONAL'}
                    onChange={e => change(idx, 'holiday_type', e.target.value)}>
                    <option value="NATIONAL">법정공휴일</option>
                    <option value="SUBSTITUTE">대체공휴일</option>
                  </select>
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  <button style={s.btnDel} onClick={() => handleDelete(idx)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Excel 전체 업로드 모달 ──────────────────────────────────────────────────
const CODE_SHEETS = ['직책명','직위명','고용형태구분','발령구분','업무구분','급여구분','수당구분','상여금구분','휴가구분','외출조퇴구분','퇴직사유','퇴직금구분']

function parseWorkbook(wb) {
  const codes = [], insurance = [], tax = [], holidays = [], leaveRates = [], skipped = []

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
      })
    }
  }

  if (wb.SheetNames.includes('보험요율')) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['보험요율'], { header: 1 })
    const header = rows[1] || []
    const ci = k => header.indexOf(k)
    const toDate = v => {
      if (!v) return null
      const s = String(v).trim()
      return s.length === 7 ? s + '-01' : s
    }
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i]
      if (!r[ci('연도')]) continue
      insurance.push({
        year: Number(r[ci('연도')]),
        pension_rate: Number(r[ci('국민연금(%)')] || 0) / 100,
        health_rate: Number(r[ci('건강보험(%)')] || 0) / 100,
        care_rate: Number(r[ci('장기요양(%)')] || 0) / 100,
        employ_rate: Number(r[ci('고용보험(%)')] || 0) / 100,
        apply_from: toDate(r[ci('적용시작')]),
        apply_to: toDate(r[ci('적용종료')]),
        memo: r[ci('비고')] || '',
      })
    }
  }

  for (const sn of wb.SheetNames.filter(n => n.startsWith('세액표') && n !== '세액표요약')) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 })
    const header = rows[1] || []
    const ci = k => header.indexOf(k)
    if (ci('연도') < 0 || ci('과세최저(원)') < 0) continue
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i]
      if (!r[ci('연도')]) continue
      tax.push({ year: Number(r[ci('연도')]), range_min: Number(r[ci('과세최저(원)')] || 0), range_max: Number(r[ci('과세최고(원)')] || 0), dependents: Number(r[ci('공제가족수')] || 1), tax_amount: Number(r[ci('세액(원)')] || 0) })
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
      leaveRates.push({
        year:              Number(r[ci('year')]),
        maternity_ei_cap:  Number(r[ci('maternity_ei_cap')]  || 0),
        paternity_days:    Number(r[ci('paternity_days')]    || 0),
        paternity_ei_cap:  r[ci('paternity_ei_cap')] != null ? Number(r[ci('paternity_ei_cap')]) : null,
        parental_cap_1_3:  Number(r[ci('parental_cap_1_3')] || 0),
        parental_cap_4_6:  Number(r[ci('parental_cap_4_6')] || 0),
        parental_cap_7p:   Number(r[ci('parental_cap_7p')]  || 0),
        parental_rate_1_6: Number(r[ci('parental_rate_1_6')]|| 1),
        parental_rate_7p:  Number(r[ci('parental_rate_7p')] || 0),
        parental_floor:    Number(r[ci('parental_floor')]    || 0),
        memo:              r[ci('memo')] || null,
      })
    }
  }

  return { codes, insurance, tax, holidays, leaveRates, skipped }
}

function BulkUploadModal({ onClose }) {
  const [preview, setPreview]     = useState(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress]   = useState('')
  const [msg, setMsg]             = useState(null)
  const [done, setDone]           = useState(false)
  const fileRef = useRef(null)

  const handleFile = async (e) => {
    const f = e.target.files?.[0]
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

  const handleImport = async () => {
    if (!preview || importing) return
    setImporting(true); setMsg(null)
    try {
      if (preview.codes.length) {
        const groups = [...new Set(preview.codes.map(c => c.group_code))]
        for (const gc of groups) {
          setProgress(`코드 [${gc}] 처리 중…`)
          const { error: delErr } = await supabase.from('seed_codes').delete().eq('group_code', gc)
          if (delErr) throw delErr
          const newCodes = preview.codes.filter(c => c.group_code === gc)
          const { error } = await supabase.from('seed_codes').insert(newCodes)
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
        const yrs = [...new Set(preview.tax.map(r => r.year))]
        for (const yr of yrs) await supabase.from('income_tax_table').delete().eq('year', yr)
        const CHUNK = 500
        for (let i = 0; i < preview.tax.length; i += CHUNK) {
          setProgress(`세액표 처리 중… ${Math.round(i / preview.tax.length * 100)}%`)
          const { error } = await supabase.from('income_tax_table').insert(preview.tax.slice(i, i + CHUNK))
          if (error) throw error
        }
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
      setProgress(''); setDone(true)
      setMsg({ type: 'success', text: '전체 업로드 완료!' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
      setProgress('')
    }
    setImporting(false)
  }

  const taxYears  = preview ? [...new Set(preview.tax.map(r => r.year))].sort().join(', ') : ''
  const holYears  = preview ? [...new Set(preview.holidays.map(r => r.year))].sort().join(', ') : ''
  const insYears  = preview ? preview.insurance.map(r => r.year).join(', ') : ''
  const lrYears   = preview ? preview.leaveRates.map(r => r.year).sort().join(', ') : ''

  return (
    <div style={s.popupOverlay} onClick={!importing ? onClose : undefined}>
      <div style={{ ...s.popupDialog, maxWidth: 540, width: '95vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>📦 Excel 전체 업로드</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>seed_export_*.xlsx 파일로 전체 시드 데이터를 한번에 업로드합니다.</div>
          </div>
          {!importing && <button onClick={onClose} style={s.alertClose}>×</button>}
        </div>

        {!preview ? (
          <div>
            <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #CBD5E1', borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', color: '#475569', transition: 'border-color .15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#93C5FD'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#CBD5E1'}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Excel 파일을 선택하세요</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>seed_export_YYYYMMDD_v*.xlsx</div>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFile} />
            {msg && <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), marginTop: 12 }}>{msg.text}</div>}
          </div>
        ) : (
          <div>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>업로드 예정 데이터</div>
              {[
                ['코드', `${preview.codes.length}건 (${[...new Set(preview.codes.map(c => c.group_code))].length}개 그룹)`],
                ['보험요율', `${preview.insurance.length}건 (${insYears}년)`],
                ['세액표', `${preview.tax.length}건 (${taxYears}년)`],
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
              ⚠️ 코드: 기존 코드명만 업데이트, 사용여부·순서·사용자추가코드 보존<br/>
              ⚠️ 보험요율·세액표·공휴일: 해당 연도 데이터 삭제 후 대체 (되돌릴 수 없음)
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
function LeaveRateTab() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [dirty,   setDirty]   = useState(false)
  const [msg,     setMsg]     = useState(null)

  const load = async () => {
    setLoading(true); setMsg(null)
    const { data, error } = await supabase
      .from('gov_leave_benefit_rates').select('*').order('year', { ascending: false })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    setItems(data || []); setDirty(false); setLoading(false)
  }
  useEffect(() => { load() }, [])

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
    }
    setItems(prev => prev.filter((_, i) => i !== idx))
    setDirty(true)
  }

  const handleSave = async () => {
    const toSave = items.filter(it => it._dirty)
    if (!toSave.length) return
    setSaving(true); setMsg(null)
    for (const it of toSave) {
      const { _dirty, id, ...payload } = it
      if (id === null) {
        const { error } = await supabase.from('gov_leave_benefit_rates').insert(payload)
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      } else {
        const { error } = await supabase.from('gov_leave_benefit_rates').update(payload).eq('id', id)
        if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
      }
    }
    setMsg({ type: 'success', text: '저장 완료' })
    setSaving(false); load()
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
      {msg && <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span>{msg.text}</span><button onClick={() => setMsg(null)} style={s.alertClose}>×</button></div>}
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
                      type="number" value={it.year}
                      onChange={e => change(idx, 'year', Number(e.target.value))} />
                  </td>
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 110, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      type="text" value={fmtAmt(it.maternity_ei_cap)}
                      onChange={e => change(idx, 'maternity_ei_cap', parseAmt(e.target.value))} />
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <input style={{ ...s.input, width: 60, textAlign: 'center' }}
                      type="number" value={it.paternity_days ?? ''}
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
                          type="number" step="1" value={it[key] != null ? (Number(it[key]) * 100).toFixed(0) : ''}
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
