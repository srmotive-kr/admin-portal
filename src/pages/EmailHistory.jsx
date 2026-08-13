import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useProduct } from '../lib/ProductContext'

const TYPE_LABELS = {
  issue: '라이선스 발급',
  download_link: '다운로드 링크',
  expiry_reminder: '만료 안내',
}

function TypeBadge({ type }) {
  const map = {
    issue: ['#EFF6FF', '#1D4ED8'],
    download_link: ['#F0FDF4', '#15803D'],
    expiry_reminder: ['#FFF7ED', '#C2410C'],
  }
  const [bg, color] = map[type] || ['var(--gray-100)', 'var(--gray-600)']
  return <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{TYPE_LABELS[type] || type}</span>
}

function ResultBadge({ success }) {
  return success
    ? <span style={{ background: 'var(--green-100)', color: '#15803D', padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>● 성공</span>
    : <span style={{ background: 'var(--red-100)', color: 'var(--red-500)', padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>✕ 실패</span>
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function EmailHistory() {
  const { productCode } = useProduct()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filter, setFilter] = useState({ q: '', type: '', result: '', dateFrom: '', dateTo: '' })
  const [page, setPage] = useState(0)
  const PAGE = 30

  async function load() {
    setLoading(true)
    setLoadError('')
    let q = supabase.from('email_logs').select('*', { count: 'exact' })
    if (productCode) q = q.eq('product_code', productCode)
    if (filter.q) q = q.or(`license_key.ilike.%${filter.q}%,email.ilike.%${filter.q}%`)
    if (filter.type) q = q.eq('type', filter.type)
    if (filter.result) q = q.eq('success', filter.result === 'success')
    if (filter.dateFrom) q = q.gte('sent_at', `${filter.dateFrom}T00:00:00`)
    if (filter.dateTo) q = q.lte('sent_at', `${filter.dateTo}T23:59:59`)
    q = q.order('sent_at', { ascending: false }).range(page * PAGE, (page + 1) * PAGE - 1)
    const { data, count, error } = await q
    if (error) setLoadError(`데이터 조회 실패: ${error.message}`)
    setRows(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [page, productCode])

  function handleSearch() {
    setPage(0)
    load()
  }

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>이메일 발송 이력 <span style={styles.totalBadge}>{total}건</span></h1>
      </div>

      <div style={styles.filters}>
        <input
          placeholder="라이선스 키 / 이메일 검색"
          value={filter.q}
          onChange={e => setFilter(f => ({ ...f, q: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
          style={styles.searchInput}
        />
        <select value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value }))} style={styles.select}>
          <option value="">유형 전체</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filter.result} onChange={e => setFilter(f => ({ ...f, result: e.target.value }))} style={styles.select}>
          <option value="">결과 전체</option>
          <option value="success">성공</option>
          <option value="fail">실패</option>
        </select>
        <div style={styles.dateRange}>
          <input
            type="date"
            value={filter.dateFrom}
            onChange={e => setFilter(f => ({ ...f, dateFrom: e.target.value }))}
            style={styles.dateInput}
          />
          <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>~</span>
          <input
            type="date"
            value={filter.dateTo}
            onChange={e => setFilter(f => ({ ...f, dateTo: e.target.value }))}
            style={styles.dateInput}
          />
        </div>
        <button onClick={handleSearch} style={styles.searchBtn}>조회</button>
      </div>

      {loadError && (
        <div style={{ background: 'var(--red-100)', color: 'var(--red-500)', borderRadius: 10, padding: '10px 16px', marginBottom: 12, fontSize: 13 }}>
          {loadError}
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.tableHead}>
          <span style={{ flex: 2 }}>발송일시</span>
          <span style={{ flex: 1 }}>유형</span>
          <span style={{ flex: 3 }}>이메일</span>
          <span style={{ flex: 3 }}>라이선스 키</span>
          <span style={{ flex: 1 }}>결과</span>
        </div>

        {loading
          ? <div style={styles.empty}>로딩 중...</div>
          : rows.length === 0
            ? <div style={styles.empty}>발송 이력이 없습니다.</div>
            : rows.map(row => (
              <div key={row.id} style={styles.tableRow}>
                <span style={{ flex: 2, color: 'var(--gray-600)' }}>{fmtDateTime(row.sent_at)}</span>
                <span style={{ flex: 1 }}><TypeBadge type={row.type} /></span>
                <span style={{ flex: 3, color: 'var(--gray-600)' }}>{row.email}</span>
                <span style={{ flex: 3, fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-700)' }}>{row.license_key || '—'}</span>
                <span style={{ flex: 1 }}><ResultBadge success={row.success} /></span>
              </div>
            ))
        }

        {rows.some(r => !r.success) && (
          <div style={styles.errorList}>
            {rows.filter(r => !r.success).map(row => (
              <div key={row.id} style={styles.errorItem}>
                <strong>{row.email}</strong> ({fmtDateTime(row.sent_at)}): {row.error}
              </div>
            ))}
          </div>
        )}

        <div style={styles.pagination}>
          <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{total === 0 ? 0 : page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} / {total}건</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</button>
            <button style={styles.pageBtn} disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>→</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--gray-900)', display: 'flex', alignItems: 'center', gap: 10 },
  totalBadge: { fontSize: 13, fontWeight: 600, color: 'var(--gray-400)', background: 'var(--gray-100)', padding: '2px 10px', borderRadius: 100 },
  filters: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  searchInput: { flex: 1, minWidth: 200, padding: '9px 13px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'white' },
  select: { padding: '9px 13px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'white', color: 'var(--gray-700)' },
  dateRange: { display: 'flex', alignItems: 'center', gap: 6 },
  dateInput: { padding: '9px 10px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'white', color: 'var(--gray-700)' },
  searchBtn: { padding: '9px 18px', background: 'var(--blue-700)', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  card: { background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid var(--gray-100)', overflow: 'hidden' },
  tableHead: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
    fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase',
    background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)',
  },
  tableRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
    fontSize: 13, borderBottom: '1px solid var(--gray-50)',
  },
  empty: { padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 },
  errorList: { padding: '10px 16px', background: 'var(--red-100)', borderTop: '1px solid var(--gray-100)' },
  errorItem: { fontSize: 12, color: 'var(--red-500)', padding: '3px 0' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--gray-100)' },
  pageBtn: { padding: '4px 12px', border: '1px solid var(--gray-200)', borderRadius: 6, background: 'white', fontSize: 12, color: 'var(--gray-600)' },
}
