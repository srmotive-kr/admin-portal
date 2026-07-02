import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const GROUPS = [
  { code: 'RANK',       label: '직책' },
  { code: 'POS',        label: '직위' },
  { code: 'EMP_TYPE',   label: '고용형태' },
  { code: 'ALLOWANCE',  label: '수당' },
  { code: 'LEAVE_TYPE', label: '휴가 유형' },
  { code: 'OUTING_TYPE',label: '외출/조퇴 유형' },
]

export default function SeedEditor() {
  const [group, setGroup]     = useState('RANK')
  const [seeds, setSeeds]     = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')
  const [newRow, setNewRow]   = useState({ code: '', name: '', memo: '' })

  useEffect(() => { fetchSeeds() }, [group])

  async function fetchSeeds() {
    setLoading(true); setMsg('')
    const { data } = await supabase
      .from('seed_codes')
      .select('*')
      .eq('group_code', group)
      .order('sort_order', { ascending: true })
    setSeeds(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    if (!newRow.code.trim() || !newRow.name.trim()) return setMsg('코드와 이름은 필수입니다.')
    setSaving(true); setMsg('')
    const maxOrder = seeds.length > 0 ? Math.max(...seeds.map(s => s.sort_order || 0)) + 1 : 1
    const { error } = await supabase.from('seed_codes').insert({
      group_code: group,
      code:       newRow.code.trim().toUpperCase(),
      name:       newRow.name.trim(),
      memo:       newRow.memo.trim() || null,
      sort_order: maxOrder,
      use_yn:     'Y',
    })
    if (error) setMsg('오류: ' + error.message)
    else { setNewRow({ code: '', name: '', memo: '' }); fetchSeeds() }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!window.confirm('삭제하시겠습니까?')) return
    await supabase.from('seed_codes').delete().eq('id', id)
    fetchSeeds()
  }

  async function handleToggle(seed) {
    await supabase.from('seed_codes').update({ use_yn: seed.use_yn === 'Y' ? 'N' : 'Y' }).eq('id', seed.id)
    fetchSeeds()
  }

  async function handleMove(seed, dir) {
    const idx    = seeds.findIndex(s => s.id === seed.id)
    const target = seeds[idx + dir]
    if (!target) return
    await supabase.from('seed_codes').update({ sort_order: target.sort_order }).eq('id', seed.id)
    await supabase.from('seed_codes').update({ sort_order: seed.sort_order }).eq('id', target.id)
    fetchSeeds()
  }

  return (
    <div>
      <h2 style={s.pageTitle}>Seed 데이터 편집기</h2>
      <p style={s.desc}>온보딩 마법사에서 기본으로 제공되는 코드 데이터를 관리합니다.</p>

      {/* 그룹 탭 */}
      <div style={s.tabs}>
        {GROUPS.map(g => (
          <button key={g.code}
            style={{ ...s.tab, ...(group === g.code ? s.tabActive : {}) }}
            onClick={() => setGroup(g.code)}>
            {g.label}
          </button>
        ))}
      </div>

      <div style={s.card}>
        {/* 새 항목 추가 */}
        <div style={s.addRow}>
          <input style={s.input} placeholder="코드 (영문대문자)" value={newRow.code}
            onChange={e => setNewRow(r => ({ ...r, code: e.target.value.toUpperCase() }))} />
          <input style={{ ...s.input, flex: 2 }} placeholder="이름" value={newRow.name}
            onChange={e => setNewRow(r => ({ ...r, name: e.target.value }))} />
          <input style={{ ...s.input, flex: 2 }} placeholder="메모 (선택)" value={newRow.memo}
            onChange={e => setNewRow(r => ({ ...r, memo: e.target.value }))} />
          <button style={s.btnAdd} onClick={handleAdd} disabled={saving}>+ 추가</button>
        </div>
        {msg && <div style={s.msg}>{msg}</div>}

        {/* 목록 */}
        {loading ? (
          <div style={s.empty}>로딩 중...</div>
        ) : seeds.length === 0 ? (
          <div style={s.empty}>등록된 Seed 데이터가 없습니다.</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>{['순서','코드','이름','메모','사용','액션'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {seeds.map((seed, idx) => (
                <tr key={seed.id} style={s.tr}>
                  <td style={s.td}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button style={s.arrowBtn} onClick={() => handleMove(seed, -1)} disabled={idx === 0}>▲</button>
                      <button style={s.arrowBtn} onClick={() => handleMove(seed, 1)} disabled={idx === seeds.length - 1}>▼</button>
                    </div>
                  </td>
                  <td style={s.td}><span style={s.code}>{seed.code}</span></td>
                  <td style={s.td}>{seed.name}</td>
                  <td style={{ ...s.td, color: '#94A3B8', fontSize: 12 }}>{seed.memo || '-'}</td>
                  <td style={s.td}>
                    <button style={{ ...s.toggleBtn, background: seed.use_yn === 'Y' ? '#16A34A' : '#94A3B8' }}
                      onClick={() => handleToggle(seed)}>
                      {seed.use_yn === 'Y' ? '사용' : '미사용'}
                    </button>
                  </td>
                  <td style={s.td}>
                    <button style={s.btnRed} onClick={() => handleDelete(seed.id)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const s = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: '#1E293B', marginBottom: 8 },
  desc: { fontSize: 13, color: '#94A3B8', marginBottom: 20 },
  tabs: { display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' },
  tab: { padding: '7px 16px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#64748B', fontFamily: 'inherit' },
  tabActive: { background: '#EFF6FF', borderColor: '#93C5FD', color: '#2563EB', fontWeight: 700 },
  card: { background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  addRow: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  input: { padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', flex: 1, minWidth: 100 },
  btnAdd: { padding: '8px 18px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', whiteSpace: 'nowrap' },
  btnRed: { padding: '4px 10px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' },
  msg: { background: '#FEF9EC', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400E', marginBottom: 12 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748B', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #F8FAFC' },
  td: { padding: '10px 12px', fontSize: 13, color: '#1E293B', verticalAlign: 'middle' },
  code: { background: '#F1F5F9', padding: '2px 8px', borderRadius: 6, fontSize: 11, color: '#475569', fontFamily: 'monospace' },
  arrowBtn: { padding: '1px 6px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#F8FAFC', cursor: 'pointer', fontSize: 10, lineHeight: 1 },
  toggleBtn: { padding: '3px 10px', color: '#fff', border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' },
  empty: { textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 14 },
}
