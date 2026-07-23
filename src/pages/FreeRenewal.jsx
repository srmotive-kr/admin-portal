import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useProduct } from '../lib/ProductContext'

const GRADE_OPTIONS = ['FREE', 'PRO', 'ENTERPRISE']

export default function FreeRenewal() {
  const { productCode } = useProduct()
  const [licenses, setLicenses] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all') // all | expiring | expired
  const [selected, setSelected] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')

  useEffect(() => { fetchLicenses() }, [filter, productCode])

  async function fetchLicenses() {
    setLoading(true)
    let q = supabase
      .from('licenses')
      .select('*')
      .eq('grade', 'FREE')
      .order('expires_at', { ascending: true, nullsFirst: false })
    if (productCode) q = q.eq('product_code', productCode)

    const now   = new Date()
    const in30  = new Date(now); in30.setDate(in30.getDate() + 30)

    if (filter === 'expiring') {
      q = q.lte('expires_at', in30.toISOString()).gte('expires_at', now.toISOString())
    } else if (filter === 'expired') {
      q = q.lt('expires_at', now.toISOString())
    }

    const { data } = await q
    setLicenses(data || [])
    setLoading(false)
  }

  async function handleRenew(lic, days) {
    setSaving(true); setMsg('')
    const base = lic.expires_at && new Date(lic.expires_at) > new Date()
      ? new Date(lic.expires_at) : new Date()
    base.setDate(base.getDate() + days)

    const { error } = await supabase
      .from('licenses')
      .update({ expires_at: base.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', lic.id)

    if (error) setMsg('오류: ' + error.message)
    else { setMsg(`${days}일 연장 완료 (${base.toISOString().slice(0,10)} 까지)`); fetchLicenses() }
    setSaving(false)
  }

  async function handleUpgrade(lic, grade) {
    setSaving(true); setMsg('')
    const { error } = await supabase
      .from('licenses')
      .update({ grade, updated_at: new Date().toISOString() })
      .eq('id', lic.id)

    if (error) setMsg('오류: ' + error.message)
    else { setMsg(`${grade} 업그레이드 완료`); setSelected(null); fetchLicenses() }
    setSaving(false)
  }

  const now = new Date()
  const statusOf = (lic) => {
    if (!lic.expires_at) return 'none'
    const exp = new Date(lic.expires_at)
    if (exp < now) return 'expired'
    const diff = Math.ceil((exp - now) / 86400000)
    if (diff <= 30) return 'expiring'
    return 'ok'
  }

  const STATUS_LABEL = { expired: '만료됨', expiring: '만료 임박', ok: '정상', none: '기간 무제한' }
  const STATUS_COLOR = { expired: '#EF4444', expiring: '#F97316', ok: '#16A34A', none: '#64748B' }

  return (
    <div>
      <h2 style={s.pageTitle}>FREE 갱신 관리</h2>

      {/* 필터 */}
      <div style={s.filterRow}>
        {[['all','전체'],['expiring','만료 임박 (30일)'],['expired','만료됨']].map(([v,l]) => (
          <button key={v} style={{ ...s.filterBtn, ...(filter===v ? s.filterActive : {}) }} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      <div style={s.layout}>
        {/* 목록 */}
        <div style={{ flex: 1 }}>
          <div style={s.card}>
            {loading ? (
              <div style={s.empty}>로딩 중...</div>
            ) : licenses.length === 0 ? (
              <div style={s.empty}>해당하는 라이선스가 없습니다.</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>{['라이선스 키','이메일','만료일','상태'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {licenses.map(lic => {
                    const st = statusOf(lic)
                    return (
                      <tr key={lic.id} style={{ ...s.tr, ...(selected?.id===lic.id ? s.trSelected : {}) }}
                          onClick={() => { setSelected(lic); setMsg('') }}>
                        <td style={s.td}><span style={s.mono}>{lic.license_key?.slice(0,18)}...</span></td>
                        <td style={s.td}>{lic.email || '-'}</td>
                        <td style={s.td}>{lic.expires_at?.slice(0,10) || '무제한'}</td>
                        <td style={s.td}><span style={{ ...s.badge, background: STATUS_COLOR[st] }}>{STATUS_LABEL[st]}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 상세 패널 */}
        {selected && (
          <div style={s.panel}>
            <div style={s.panelTitle}>갱신 / 업그레이드</div>
            <div style={s.monoBlock}>{selected.license_key}</div>
            <div style={s.panelRow}>
              <span style={s.panelLabel}>이메일</span>
              <span>{selected.email || '-'}</span>
            </div>
            <div style={s.panelRow}>
              <span style={s.panelLabel}>현재 만료일</span>
              <span>{selected.expires_at?.slice(0,10) || '무제한'}</span>
            </div>
            <div style={s.panelRow}>
              <span style={s.panelLabel}>상태</span>
              <span style={{ color: STATUS_COLOR[statusOf(selected)] }}>{STATUS_LABEL[statusOf(selected)]}</span>
            </div>

            <div style={s.divider} />
            <div style={s.sectionLabel}>기간 연장 (FREE 유지)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[30, 90, 180, 365].map(d => (
                <button key={d} style={s.btnBlue} onClick={() => handleRenew(selected, d)} disabled={saving}>
                  +{d}일
                </button>
              ))}
            </div>

            <div style={s.divider} />
            <div style={s.sectionLabel}>등급 업그레이드</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {GRADE_OPTIONS.filter(g => g !== 'FREE').map(g => (
                <button key={g} style={{ ...s.btnBlue, background: g==='ENTERPRISE' ? '#7C3AED' : '#2563EB' }}
                  onClick={() => handleUpgrade(selected, g)} disabled={saving}>{g}</button>
              ))}
            </div>

            {msg && <div style={s.msg}>{msg}</div>}

            <button style={s.closeBtn} onClick={() => { setSelected(null); setMsg('') }}>닫기</button>
          </div>
        )}
      </div>
    </div>
  )
}

const s = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: '#1E293B', marginBottom: 24 },
  filterRow: { display: 'flex', gap: 8, marginBottom: 20 },
  filterBtn: { padding: '7px 16px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#64748B', fontFamily: 'inherit' },
  filterActive: { background: '#EFF6FF', borderColor: '#93C5FD', color: '#2563EB', fontWeight: 700 },
  layout: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  card: { background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748B', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #F8FAFC', cursor: 'pointer' },
  trSelected: { background: '#EFF6FF' },
  td: { padding: '12px 12px', fontSize: 13, color: '#1E293B', verticalAlign: 'middle' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#fff' },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  empty: { textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 14 },
  panel: { width: 280, background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  panelTitle: { fontSize: 15, fontWeight: 700, color: '#1E293B' },
  monoBlock: { background: '#F8FAFC', borderRadius: 8, padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#475569', wordBreak: 'break-all' },
  panelRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13 },
  panelLabel: { color: '#94A3B8', fontSize: 12 },
  divider: { borderTop: '1px solid #F1F5F9' },
  sectionLabel: { fontSize: 12, fontWeight: 600, color: '#374151' },
  btnBlue: { padding: '7px 14px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600 },
  msg: { background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#16A34A' },
  closeBtn: { padding: '8px 0', background: 'none', border: '1px solid #E2E8F0', borderRadius: 8, color: '#94A3B8', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 },
}
