import { useEffect, useState, useCallback } from 'react'
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
  { code: 'RESIGN_REASON', label: '퇴직사유',       hasTaxable: false, hasOrdinary: false },
  { code: 'SEVERANCE_TYPE',label: '퇴직금구분',     hasTaxable: false, hasOrdinary: false },
]

const MAIN_TABS = ['코드', '보험요율', '세액표', '공휴일']

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

  return (
    <div>
      <h2 style={s.pageTitle}>Seed 데이터 편집기</h2>
      <p style={s.desc}>온보딩 마법사에서 기본으로 제공되는 코드·보험요율·세액표·공휴일 데이터를 관리합니다.</p>

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
      {mainTab === '보험요율' && <InsuranceTab />}
      {mainTab === '세액표'   && <TaxTab />}
      {mainTab === '공휴일'   && <HolidayTab />}
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
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('success')} onClick={handleAdd} disabled={saving}>+ 행 추가</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>

        {msg && (
          <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk) }}>
            {msg.text}
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
                  <th style={{ ...s.th, width: 56, textAlign: 'center' }}>사용</th>
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
                        {isSys ? (
                          <span style={{ color: '#1E293B' }}>{it.name}</span>
                        ) : (
                          <input style={s.input} value={it.name}
                            onChange={e => change(idx, 'name', e.target.value)}
                            placeholder="코드명 입력" />
                        )}
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
                        <button style={{ ...s.toggleBtn, background: it.use_yn === 'Y' ? '#16A34A' : '#94A3B8' }}
                          onClick={() => change(idx, 'use_yn', it.use_yn === 'Y' ? 'N' : 'Y')}>
                          {it.use_yn === 'Y' ? '사용' : '미사용'}
                        </button>
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
        <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
        <button style={s.btn('success')} onClick={handleAdd} disabled={saving}>+ 연도 추가</button>
        <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
          {saving ? '저장 중…' : '💾 저장'}
        </button>
      </div>
      {msg && <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk) }}>{msg.text}</div>}
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: 70 }}>연도</th>
                <th style={{ ...s.th, width: 110, textAlign: 'center' }}>국민연금</th>
                <th style={{ ...s.th, width: 110, textAlign: 'center' }}>건강보험</th>
                <th style={{ ...s.th, width: 110, textAlign: 'center' }}>장기요양</th>
                <th style={{ ...s.th, width: 110, textAlign: 'center' }}>고용보험</th>
                <th style={{ ...s.th, width: 100 }}>적용시작</th>
                <th style={{ ...s.th, width: 100 }}>적용종료</th>
                <th style={s.th}>비고</th>
                <th style={{ ...s.th, width: 56, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} style={{ background: it._dirty ? 'rgba(37,99,235,.03)' : 'transparent', borderBottom: '1px solid #F1F5F9' }}>
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 60, textAlign: 'center' }}
                      type="number" value={it.year}
                      onChange={e => change(idx, 'year', Number(e.target.value))} />
                  </td>
                  {['pension_rate','health_rate','care_rate','employ_rate'].map(key => (
                    <td key={key} style={{ ...s.td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                        <input style={{ ...s.input, width: 70, textAlign: 'right' }}
                          type="number" step="0.0001" value={Number(it[key] || 0) * 100}
                          onChange={e => change(idx, key, Number(e.target.value) / 100)} />
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>%</span>
                      </div>
                    </td>
                  ))}
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 90 }} type="date"
                      value={it.apply_from || ''}
                      onChange={e => change(idx, 'apply_from', e.target.value || null)} />
                  </td>
                  <td style={s.td}>
                    <input style={{ ...s.input, width: 90 }} type="date"
                      value={it.apply_to || ''}
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
  const [years, setYears]     = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg]         = useState(null)

  const load = async () => {
    setLoading(true); setMsg(null)
    const { data, error } = await supabase
      .from('income_tax_table')
      .select('year')
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }
    const counts = {}
    for (const r of data || []) counts[r.year] = (counts[r.year] || 0) + 1
    setYears(Object.entries(counts).sort((a, b) => b[0] - a[0]).map(([y, c]) => ({ year: Number(y), count: c })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const handleDelete = async (year) => {
    if (!window.confirm(`${year}년 세액표 전체(${years.find(y => y.year === year)?.count || 0}건)를 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('income_tax_table').delete().eq('year', year)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    load()
  }

  return (
    <div style={s.card}>
      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, fontSize: 13, color: '#9A3412' }}>
        ℹ️ 세액표는 행 수가 많아 연도 단위로 관리합니다. 새 연도 데이터는 엑셀/JSON 파일 업로드 기능으로 추가하세요. (업로드 기능 추후 구현)
      </div>
      {msg && <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk) }}>{msg.text}</div>}
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 100 }}>연도</th>
              <th style={{ ...s.th, width: 120 }}>데이터 수</th>
              <th style={s.th}>설명</th>
              <th style={{ ...s.th, width: 80, textAlign: 'center' }}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {years.length === 0 ? (
              <tr><td colSpan={4} style={s.empty}>등록된 세액표가 없습니다.</td></tr>
            ) : years.map(({ year, count }) => (
              <tr key={year} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ ...s.td, fontWeight: 700 }}>{year}년</td>
                <td style={s.td}>{count.toLocaleString()}건</td>
                <td style={{ ...s.td, color: '#64748B', fontSize: 12 }}>국세청 근로소득 간이세액표 {year}년 기준</td>
                <td style={{ ...s.td, textAlign: 'center' }}>
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
          <button style={s.btn('ghost')} onClick={load} disabled={saving}>↺ 새로고침</button>
          <button style={s.btn('success')} onClick={handleAdd} disabled={saving}>+ 공휴일 추가</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      {msg && <div style={{ ...s.alert, ...(msg.type === 'error' ? s.alertError : s.alertOk) }}>{msg.text}</div>}
      {loading ? <div style={s.empty}>로딩 중…</div> : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>날짜</th>
              <th style={s.th}>공휴일명</th>
              <th style={{ ...s.th, width: 120 }}>유형</th>
              <th style={{ ...s.th, width: 56, textAlign: 'center' }}>삭제</th>
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
                    <option value="CUSTOM">지정공휴일</option>
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

// ─── 스타일 ──────────────────────────────────────────────────────────────────
const s = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: '#1E293B', marginBottom: 6 },
  desc:      { fontSize: 13, color: '#94A3B8', marginBottom: 20 },

  mainTabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #E2E8F0', paddingBottom: 0 },
  mainTab:  {
    padding: '9px 20px', border: 'none', background: 'transparent',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#64748B',
    borderBottom: '2px solid transparent', marginBottom: -2, fontFamily: 'inherit',
    transition: 'color .15s',
  },
  mainTabActive: { color: '#2563EB', borderBottomColor: '#2563EB' },

  groupSidebar: {
    width: 130, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2,
    borderRight: '1px solid #E2E8F0', paddingRight: 12, marginRight: 16,
  },
  groupBtn: {
    padding: '8px 12px', border: '1px solid transparent', borderRadius: 8,
    background: 'transparent', fontSize: 13, cursor: 'pointer', color: '#475569',
    textAlign: 'left', fontFamily: 'inherit', fontWeight: 500,
    transition: 'all .12s',
  },
  groupBtnActive: { background: '#EFF6FF', borderColor: '#93C5FD', color: '#2563EB', fontWeight: 700 },

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
  },
}
