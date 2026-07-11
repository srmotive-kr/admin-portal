import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const SEVERITY_LABEL = { info: '일반', warning: '경고', critical: '긴급' }
const SEVERITY_COLOR = {
  info:     { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  warning:  { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
  critical: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
}

const t = {
  h1: { fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 4 },
  sub: { fontSize: 13, color: '#64748B', marginBottom: 28 },
  card: {
    background: '#fff', border: '1px solid #E2E8F0',
    borderRadius: 10, padding: 20, marginBottom: 20,
  },
  label: { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' },
  input: {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid #CBD5E1', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  },
  textarea: {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid #CBD5E1', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: 80,
  },
  row: { display: 'flex', gap: 12, marginBottom: 14 },
  col: { flex: 1 },
  select: {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid #CBD5E1', fontSize: 13, fontFamily: 'inherit',
    background: '#fff', outline: 'none', cursor: 'pointer',
  },
  btn: (color) => ({
    padding: '8px 18px', borderRadius: 7, border: 'none',
    background: color || '#1D4ED8', color: '#fff',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  }),
  msgRow: (sev) => ({
    padding: '12px 16px', borderRadius: 8, marginBottom: 8,
    border: `1px solid ${SEVERITY_COLOR[sev]?.border || '#E2E8F0'}`,
    background: SEVERITY_COLOR[sev]?.bg || '#F8FAFC',
    display: 'flex', alignItems: 'flex-start', gap: 12,
  }),
  badge: (sev) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 12,
    fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2,
    background: SEVERITY_COLOR[sev]?.bg || '#F1F5F9',
    color: SEVERITY_COLOR[sev]?.color || '#475569',
    border: `1px solid ${SEVERITY_COLOR[sev]?.border || '#E2E8F0'}`,
  }),
  msgBody: { flex: 1 },
  msgTitle: { fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 3 },
  msgText: { fontSize: 12, color: '#475569', lineHeight: 1.5 },
  msgMeta: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  delBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#94A3B8', fontSize: 14, padding: '2px 6px', flexShrink: 0,
  },
  err: { color: '#DC2626', fontSize: 12, marginTop: 6 },
  ok: { color: '#16A34A', fontSize: 12, marginTop: 6 },
  hint: { fontSize: 11, color: '#94A3B8', marginTop: 3, lineHeight: 1.4 },
}

const EMPTY_FORM = {
  title: '', body: '', severity: 'info',
  require_ack: false, action_label: '', action_menu: '', expires_at: '',
}

export default function BroadcastManager() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(true)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')
  const [ok, setOk]             = useState('')

  useEffect(() => { fetchMessages() }, [])

  async function fetchMessages() {
    setLoading(true)
    const { data } = await supabase
      .from('broadcast_messages')
      .select('*')
      .order('created_at', { ascending: false })
    setMessages(data || [])
    setLoading(false)
  }

  async function handleSend() {
    if (!form.title.trim()) return setErr('제목을 입력하세요.')
    if (!form.body.trim())  return setErr('내용을 입력하세요.')
    setErr(''); setOk(''); setSaving(true)
    const payload = {
      title:       form.title.trim(),
      body:        form.body.trim(),
      severity:    form.severity,
      require_ack: form.require_ack,
      action_label: form.action_label.trim() || null,
      action_menu:  form.action_menu.trim()  || null,
      expires_at:  form.expires_at || null,
    }
    const { error } = await supabase.from('broadcast_messages').insert(payload)
    setSaving(false)
    if (error) return setErr(error.message)
    setOk('공지 전송 완료')
    setForm(EMPTY_FORM)
    fetchMessages()
  }

  async function handleDelete(id) {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return
    await supabase.from('broadcast_messages').delete().eq('id', id)
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  return (
    <div>
      <div style={t.h1}>공지 관리</div>
      <div style={t.sub}>앱 사용자(고객)에게 공지를 전달합니다. 앱 로그인 시 자동으로 표시됩니다.</div>

      {/* 등록 폼 */}
      <div style={t.card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 16 }}>새 공지 등록</div>

        <div style={{ marginBottom: 14 }}>
          <label style={t.label}>제목</label>
          <input style={t.input} value={form.title} onChange={set('title')} placeholder="공지 제목" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={t.label}>내용</label>
          <textarea style={t.textarea} value={form.body} onChange={set('body')} placeholder="공지 내용" />
        </div>

        <div style={t.row}>
          <div style={t.col}>
            <label style={t.label}>심각도</label>
            <select style={t.select} value={form.severity} onChange={set('severity')}>
              <option value="info">일반 (벨 드롭다운)</option>
              <option value="warning">경고 (상단 배너)</option>
              <option value="critical">긴급 (차단 모달)</option>
            </select>
          </div>
          <div style={t.col}>
            <label style={t.label}>만료일 (없으면 영구)</label>
            <input type="date" style={t.input} value={form.expires_at} onChange={set('expires_at')} />
          </div>
        </div>

        {form.severity === 'critical' && (
          <div style={t.row}>
            <div style={t.col}>
              <label style={t.label}>조치 버튼 텍스트 (선택)</label>
              <input style={t.input} value={form.action_label} onChange={set('action_label')} placeholder="예: 보험료 정산으로 이동" />
            </div>
            <div style={t.col}>
              <label style={t.label}>이동할 메뉴 키 (선택)</label>
              <input style={t.input} value={form.action_menu} onChange={set('action_menu')} placeholder="예: ts (정산업무)" />
              <div style={t.hint}>앱 메뉴 키: dh(대시보드) hr(채용정보) ts(정산업무) pl(급여내역) sm(시스템관리)</div>
            </div>
          </div>
        )}

        <button style={t.btn()} onClick={handleSend} disabled={saving}>
          {saving ? '전송 중...' : '공지 전송'}
        </button>
        {err && <div style={t.err}>{err}</div>}
        {ok  && <div style={t.ok}>{ok}</div>}
      </div>

      {/* 기존 공지 목록 */}
      <div style={t.card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>
          활성 공지 ({messages.length})
        </div>
        {loading && <div style={{ fontSize: 13, color: '#94A3B8' }}>불러오는 중...</div>}
        {!loading && messages.length === 0 && (
          <div style={{ fontSize: 13, color: '#94A3B8' }}>등록된 공지가 없습니다.</div>
        )}
        {messages.map(m => (
          <div key={m.id} style={t.msgRow(m.severity)}>
            <span style={t.badge(m.severity)}>{SEVERITY_LABEL[m.severity] || m.severity}</span>
            <div style={t.msgBody}>
              <div style={t.msgTitle}>{m.title}</div>
              <div style={t.msgText}>{m.body}</div>
              {m.action_label && <div style={{ ...t.msgMeta, color: '#6366F1' }}>버튼: {m.action_label} → {m.action_menu}</div>}
              <div style={t.msgMeta}>
                {new Date(m.created_at).toLocaleString('ko-KR')}
                {m.expires_at && ` · 만료: ${new Date(m.expires_at).toLocaleDateString('ko-KR')}`}
              </div>
            </div>
            <button style={t.delBtn} onClick={() => handleDelete(m.id)} title="삭제">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
