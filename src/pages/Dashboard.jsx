import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ ...styles.statCard, borderTop: `3px solid ${color}` }}>
      <div style={{ ...styles.statValue, color }}>{value ?? '—'}</div>
      <div style={styles.statLabel}>{label}</div>
      {sub && <div style={styles.statSub}>{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({ active: null, newMonth: null, expiringSoon: null, pending: null })
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString()

      const [activeRes, newRes, expiringRes, pendingRes, eventsRes] = await Promise.all([
        supabase.from('licenses').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
        supabase.from('licenses').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').gte('created_at', monthStart),
        supabase.from('licenses').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').not('expires_at', 'is', null).lte('expires_at', in30),
        supabase.from('licenses').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
        supabase.from('licenses').select('license_key, grade, status, email, created_at').order('created_at', { ascending: false }).limit(10),
      ])

      setStats({
        active: activeRes.count,
        newMonth: newRes.count,
        expiringSoon: expiringRes.count,
        pending: pendingRes.count,
      })
      setEvents(eventsRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={styles.loading}>로딩 중...</div>

  return (
    <div>
      <h1 style={styles.pageTitle}>대시보드</h1>

      <div style={styles.statGrid}>
        <StatCard label="활성 라이선스" value={stats.active} color="var(--blue-500)" />
        <StatCard label="이번달 신규" value={stats.newMonth} color="var(--green-500)" />
        <StatCard label="만료 임박 (30일)" value={stats.expiringSoon} color="var(--yellow-500)" />
        <StatCard label="미처리 주문" value={stats.pending} color="var(--orange-500)" sub="채널 A" />
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>최근 라이선스 발급</h2>
        <div style={styles.table}>
          <div style={styles.tableHead}>
            <span style={{ flex: 2 }}>라이선스 키</span>
            <span style={{ flex: 1 }}>등급</span>
            <span style={{ flex: 2 }}>이메일</span>
            <span style={{ flex: 1 }}>상태</span>
            <span style={{ flex: 2 }}>발급일시</span>
          </div>
          {events.length === 0
            ? <div style={styles.empty}>발급 내역이 없습니다.</div>
            : events.map(row => (
              <div key={row.license_key} style={styles.tableRow}>
                <span style={{ flex: 2, fontFamily: 'monospace', fontSize: 12 }}>{row.license_key?.slice(0, 16)}…</span>
                <span style={{ flex: 1 }}><GradeBadge grade={row.grade} /></span>
                <span style={{ flex: 2, color: 'var(--gray-600)' }}>{row.email || '—'}</span>
                <span style={{ flex: 1 }}><StatusBadge status={row.status} /></span>
                <span style={{ flex: 2, color: 'var(--gray-500)', fontSize: 12 }}>{fmt(row.created_at)}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

function GradeBadge({ grade }) {
  const map = { FREE: ['#EFF6FF', '#1D4ED8'], PRO: ['#F0FDF4', '#15803D'], ENTERPRISE: ['#FAF5FF', '#7E22CE'], STARTER: ['#FFF7ED', '#C2410C'] }
  const [bg, color] = map[grade] || ['var(--gray-100)', 'var(--gray-600)']
  return <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{grade}</span>
}

function StatusBadge({ status }) {
  const map = { ACTIVE: ['var(--green-100)', 'var(--green-500)', '● 활성'], PENDING: ['var(--yellow-100)', 'var(--yellow-500)', '○ 대기'], EXPIRED: ['var(--gray-100)', 'var(--gray-500)', '✕ 만료'] }
  const [bg, color, label] = map[status] || ['var(--gray-100)', 'var(--gray-500)', status]
  return <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{label}</span>
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const styles = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 24 },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 },
  statCard: {
    background: 'white', borderRadius: 14, padding: '24px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid var(--gray-100)',
  },
  statValue: { fontSize: 36, fontWeight: 900, lineHeight: 1, marginBottom: 6 },
  statLabel: { fontSize: 13, color: 'var(--gray-600)', fontWeight: 600 },
  statSub: { fontSize: 11, color: 'var(--gray-400)', marginTop: 2 },
  section: { background: 'white', borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid var(--gray-100)' },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 16 },
  table: { display: 'flex', flexDirection: 'column' },
  tableHead: {
    display: 'flex', gap: 12, padding: '8px 12px',
    fontSize: 11, fontWeight: 700, color: 'var(--gray-400)',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    borderBottom: '1px solid var(--gray-100)',
  },
  tableRow: {
    display: 'flex', gap: 12, padding: '12px 12px',
    fontSize: 13, borderBottom: '1px solid var(--gray-50)',
    alignItems: 'center',
  },
  empty: { padding: '32px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--gray-400)' },
}
