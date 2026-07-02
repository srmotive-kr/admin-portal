import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const GRADES = ['', 'FREE', 'STARTER', 'PRO', 'ENTERPRISE']
const STATUSES = ['', 'ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED']
const CHANNELS = ['', 'A', 'B', 'C', 'E']

function GradeBadge({ grade }) {
  const map = { FREE: ['#EFF6FF', '#1D4ED8'], PRO: ['#F0FDF4', '#15803D'], ENTERPRISE: ['#FAF5FF', '#7E22CE'], STARTER: ['#FFF7ED', '#C2410C'] }
  const [bg, color] = map[grade] || ['var(--gray-100)', 'var(--gray-600)']
  return <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{grade}</span>
}

function StatusBadge({ status }) {
  const map = {
    ACTIVE: ['var(--green-100)', '#15803D', '● 활성'],
    PENDING: ['var(--yellow-100)', '#A16207', '○ 대기'],
    EXPIRED: ['var(--gray-100)', 'var(--gray-500)', '✕ 만료'],
    REVOKED: ['var(--red-100)', 'var(--red-500)', '✕ 취소'],
  }
  const [bg, color, label] = map[status] || ['var(--gray-100)', 'var(--gray-500)', status]
  return <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{label}</span>
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

export default function LicenseManager() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [filter, setFilter] = useState({ q: '', grade: '', status: '', channel: '' })
  const [page, setPage] = useState(0)
  const PAGE = 20

  async function load() {
    setLoading(true)
    let q = supabase.from('licenses').select('*', { count: 'exact' })
    if (filter.q) q = q.or(`license_key.ilike.%${filter.q}%,email.ilike.%${filter.q}%`)
    if (filter.grade) q = q.eq('grade', filter.grade)
    if (filter.status) q = q.eq('status', filter.status)
    if (filter.channel) q = q.eq('channel', filter.channel)
    q = q.order('created_at', { ascending: false }).range(page * PAGE, (page + 1) * PAGE - 1)
    const { data, count } = await q
    setRows(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [filter, page])

  function handleCheck(id) {
    setRows(r => r.map(x => x.id === id ? { ...x, _checked: !x._checked } : x))
  }

  const checked = rows.filter(r => r._checked)

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>라이선스 관리 <span style={styles.totalBadge}>{total}건</span></h1>
        <button style={styles.btnPrimary} onClick={() => setShowIssueModal(true)}>+ 수동 발급</button>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        <input
          placeholder="라이선스 키 / 이메일 검색"
          value={filter.q}
          onChange={e => { setFilter(f => ({ ...f, q: e.target.value })); setPage(0) }}
          style={styles.searchInput}
        />
        <select value={filter.grade} onChange={e => { setFilter(f => ({ ...f, grade: e.target.value })); setPage(0) }} style={styles.select}>
          <option value="">등급 전체</option>
          {GRADES.filter(Boolean).map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filter.status} onChange={e => { setFilter(f => ({ ...f, status: e.target.value })); setPage(0) }} style={styles.select}>
          <option value="">상태 전체</option>
          {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filter.channel} onChange={e => { setFilter(f => ({ ...f, channel: e.target.value })); setPage(0) }} style={styles.select}>
          <option value="">채널 전체</option>
          {CHANNELS.filter(Boolean).map(c => <option key={c} value={c}>채널 {c}</option>)}
        </select>
      </div>

      {checked.length > 0 && (
        <div style={styles.bulkBar}>
          {checked.length}건 선택됨
          <button style={styles.btnSm}>이메일 발송</button>
          <button style={styles.btnSm}>만료일 연장</button>
        </div>
      )}

      {/* Table */}
      <div style={styles.card}>
        <div style={styles.tableHead}>
          <input type="checkbox" style={{ width: 16 }}
            onChange={e => setRows(r => r.map(x => ({ ...x, _checked: e.target.checked })))}
          />
          <span style={{ flex: 3 }}>라이선스 키</span>
          <span style={{ flex: 1 }}>등급</span>
          <span style={{ flex: 3 }}>이메일</span>
          <span style={{ flex: 1 }}>채널</span>
          <span style={{ flex: 2 }}>만료일</span>
          <span style={{ flex: 1 }}>상태</span>
        </div>

        {loading
          ? <div style={styles.empty}>로딩 중...</div>
          : rows.length === 0
            ? <div style={styles.empty}>검색 결과가 없습니다.</div>
            : rows.map(row => (
              <div key={row.id} style={{ ...styles.tableRow, background: row._checked ? 'var(--blue-50)' : undefined }}
                onClick={() => setSelected(row)}>
                <input type="checkbox" checked={!!row._checked} style={{ width: 16 }}
                  onClick={e => e.stopPropagation()}
                  onChange={() => handleCheck(row.id)}
                />
                <span style={{ flex: 3, fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-700)' }}>{row.license_key}</span>
                <span style={{ flex: 1 }}><GradeBadge grade={row.grade} /></span>
                <span style={{ flex: 3, color: 'var(--gray-600)' }}>{row.email || '—'}</span>
                <span style={{ flex: 1, color: 'var(--gray-500)' }}>{row.channel ? `채널 ${row.channel}` : '—'}</span>
                <span style={{ flex: 2, color: 'var(--gray-600)' }}>{fmt(row.expires_at)}</span>
                <span style={{ flex: 1 }}><StatusBadge status={row.status} /></span>
              </div>
            ))
        }

        {/* Pagination */}
        <div style={styles.pagination}>
          <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} / {total}건</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</button>
            <button style={styles.pageBtn} disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>→</button>
          </div>
        </div>
      </div>

      {selected && <DetailPanel row={selected} onClose={() => setSelected(null)} onRefresh={load} />}
      {showIssueModal && <IssueModal onClose={() => setShowIssueModal(false)} onRefresh={load} />}
    </div>
  )
}

function DetailPanel({ row, onClose, onRefresh }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ grade: row.grade, expires_at: row.expires_at?.slice(0, 10) || '', notes: row.notes || '' })

  async function save() {
    setSaving(true)
    await supabase.from('licenses').update({ ...form, updated_at: new Date().toISOString() }).eq('id', row.id)
    setSaving(false)
    onRefresh()
    onClose()
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        <div style={styles.panelHeader}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>라이선스 상세</h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.panelBody}>
          <div style={styles.infoRow}><span style={styles.infoKey}>라이선스 키</span><code style={styles.code}>{row.license_key}</code></div>
          <div style={styles.infoRow}><span style={styles.infoKey}>상태</span><StatusBadge status={row.status} /></div>
          <div style={styles.infoRow}><span style={styles.infoKey}>채널</span><span>{row.channel ? `채널 ${row.channel}` : '—'}</span></div>
          <div style={styles.infoRow}><span style={styles.infoKey}>발급일</span><span>{new Date(row.created_at).toLocaleString('ko-KR')}</span></div>
          <div style={styles.infoRow}><span style={styles.infoKey}>이메일</span><span>{row.email || '—'}</span></div>

          <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--gray-100)' }} />

          <div style={styles.field}>
            <label style={styles.label}>등급</label>
            <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} style={styles.input}>
              {['FREE', 'STARTER', 'PRO', 'ENTERPRISE'].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>만료일</label>
            <input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>메모</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...styles.input, height: 72, resize: 'vertical' }} />
          </div>

          <button onClick={save} disabled={saving} style={{ ...styles.btnPrimary, width: '100%', marginTop: 8 }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

function IssueModal({ onClose, onRefresh }) {
  const [form, setForm] = useState({ grade: 'FREE', email: '', expires_at: '', notes: '', channel: 'A' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)

  async function issue() {
    setSaving(true)
    const key = `SMHR-${uuid4()}`
    const { data, error } = await supabase.from('licenses').insert({
      license_key: key,
      grade: form.grade,
      email: form.email || null,
      expires_at: form.expires_at || null,
      notes: form.notes || null,
      channel: form.channel,
      status: 'ACTIVE',
      product_code: 'smart-hr-plus',
      max_emps: { FREE: 4, STARTER: 9, PRO: 29, ENTERPRISE: 0 }[form.grade] ?? 4,
    }).select().single()
    setSaving(false)
    if (!error) { setDone(data); onRefresh() }
  }

  if (done) return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.panel, width: 440 }} onClick={e => e.stopPropagation()}>
        <div style={styles.panelHeader}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>발급 완료</h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>
        <div style={styles.panelBody}>
          <div style={{ background: 'var(--green-100)', borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ color: '#15803D', fontWeight: 700, marginBottom: 8 }}>✓ 라이선스 발급 완료</div>
            <code style={{ ...styles.code, fontSize: 14 }}>{done.license_key}</code>
          </div>
          <button onClick={onClose} style={{ ...styles.btnPrimary, width: '100%' }}>닫기</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.panel, width: 440 }} onClick={e => e.stopPropagation()}>
        <div style={styles.panelHeader}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>수동 라이선스 발급</h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>
        <div style={styles.panelBody}>
          <div style={styles.field}>
            <label style={styles.label}>등급 *</label>
            <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} style={styles.input}>
              {['FREE', 'STARTER', 'PRO', 'ENTERPRISE'].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>채널</label>
            <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} style={styles.input}>
              <option value="A">A — 마켓플레이스</option>
              <option value="E">E — 오프라인/USB</option>
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>이메일 (라이선스 키 발송)</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="customer@example.com" style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>만료일 (비워두면 무기한)</label>
            <input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>메모</label>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={styles.input} />
          </div>
          <button onClick={issue} disabled={saving} style={{ ...styles.btnPrimary, width: '100%', marginTop: 8 }}>
            {saving ? '발급 중...' : '발급'}
          </button>
        </div>
      </div>
    </div>
  )
}

function uuid4() {
  return 'xxxx-xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16).toUpperCase())
}

const styles = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--gray-900)', display: 'flex', alignItems: 'center', gap: 10 },
  totalBadge: { fontSize: 13, fontWeight: 600, color: 'var(--gray-400)', background: 'var(--gray-100)', padding: '2px 10px', borderRadius: 100 },
  filters: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  searchInput: { flex: 1, minWidth: 200, padding: '9px 13px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'white' },
  select: { padding: '9px 13px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'white', color: 'var(--gray-700)' },
  bulkBar: { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--blue-50)', border: '1px solid var(--blue-100)', borderRadius: 10, padding: '8px 16px', marginBottom: 12, fontSize: 13, fontWeight: 600, color: 'var(--blue-700)' },
  card: { background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid var(--gray-100)', overflow: 'hidden' },
  tableHead: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
    fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase',
    background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)',
  },
  tableRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
    fontSize: 13, borderBottom: '1px solid var(--gray-50)', cursor: 'pointer',
    transition: 'background 0.1s',
  },
  empty: { padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--gray-100)' },
  pageBtn: { padding: '4px 12px', border: '1px solid var(--gray-200)', borderRadius: 6, background: 'white', fontSize: 12, color: 'var(--gray-600)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' },
  panel: { width: 440, background: 'white', height: '100%', overflow: 'auto', boxShadow: '-8px 0 24px rgba(0,0,0,0.1)' },
  panelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--gray-100)', position: 'sticky', top: 0, background: 'white', zIndex: 1 },
  panelBody: { padding: 24, display: 'flex', flexDirection: 'column', gap: 14 },
  infoRow: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 },
  infoKey: { width: 80, color: 'var(--gray-400)', fontWeight: 600, flexShrink: 0 },
  code: { fontFamily: 'monospace', fontSize: 12, background: 'var(--gray-100)', padding: '3px 8px', borderRadius: 6 },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--gray-600)' },
  input: { padding: '9px 12px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, outline: 'none' },
  closeBtn: { background: 'none', border: 'none', fontSize: 16, color: 'var(--gray-400)', padding: 4 },
  btnPrimary: { background: 'var(--blue-700)', color: 'white', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700 },
  btnSm: { background: 'white', border: '1px solid var(--blue-200)', color: 'var(--blue-700)', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600 },
}
