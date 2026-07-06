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
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(null)
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [filter, setFilter] = useState({ q: '', grade: '', status: '', channel: '' })
  const [page, setPage] = useState(0)
  const PAGE = 20

  async function load() {
    setLoading(true)
    setLoadError('')
    let q = supabase.from('licenses').select('*', { count: 'exact' })
    if (filter.q) q = q.or(`license_key.ilike.%${filter.q}%,email.ilike.%${filter.q}%`)
    if (filter.grade) q = q.eq('grade', filter.grade)
    if (filter.status) q = q.eq('status', filter.status)
    if (filter.channel) q = q.eq('channel', filter.channel)
    q = q.order('created_at', { ascending: false }).range(page * PAGE, (page + 1) * PAGE - 1)
    const { data, count, error } = await q
    if (error) setLoadError(`데이터 조회 실패: ${error.message}`)
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

      {loadError && (
        <div style={{ background: 'var(--red-100)', color: 'var(--red-500)', borderRadius: 10, padding: '10px 16px', marginBottom: 12, fontSize: 13 }}>
          {loadError}
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
          <span style={{ flex: 1, textAlign: 'center' }}>설치</span>
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
                <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: row.hw_ids?.length > 0 ? 'var(--blue-700)' : 'var(--gray-300)' }}>
                  {row.hw_ids?.length > 0 ? `${row.hw_ids.length}대` : '—'}
                </span>
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
  const [saveMsg, setSaveMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const [form, setForm] = useState({
    grade: row.grade,
    status: row.status,
    expires_at: row.expires_at?.slice(0, 10) || '',
    notes: row.notes || '',
    email: row.email || '',
    max_emps: row.max_emps ?? '',
    max_users: row.max_users ?? '',
  })
  const [hwIds, setHwIds] = useState(row.hw_ids || [])
  const [dlLogs, setDlLogs] = useState([])
  const [dlLoading, setDlLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')
  const [emailErr, setEmailErr] = useState('')
  const [unlockCode, setUnlockCode] = useState('')
  const [unlockLoading, setUnlockLoading] = useState(false)
  const [unlockErr, setUnlockErr] = useState('')
  const [unlockEmailSent, setUnlockEmailSent] = useState(false)
  const [unlockMaskedEmail, setUnlockMaskedEmail] = useState('')

  useEffect(() => {
    supabase.from('download_logs')
      .select('version, downloaded_at')
      .eq('license_key', row.license_key)
      .order('downloaded_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { setDlLogs(data || []); setDlLoading(false) })
  }, [row.license_key])

  async function save() {
    setSaving(true); setSaveMsg(''); setSaveErr('')
    const { error } = await supabase.from('licenses').update({
      grade: form.grade,
      status: form.status,
      expires_at: form.expires_at || null,
      notes: form.notes || null,
      max_emps: form.max_emps !== '' ? Number(form.max_emps) : null,
      max_users: form.max_users !== '' ? Number(form.max_users) : null,
      updated_at: new Date().toISOString(),
    }).eq('license_key', row.license_key)
    setSaving(false)
    if (error) setSaveErr(`저장 실패: ${error.message}`)
    else { setSaveMsg('저장됨'); onRefresh() }
  }

  async function saveEmail() {
    setEmailMsg(''); setEmailErr('')
    const { error } = await supabase.from('licenses').update({
      email: form.email || null,
      updated_at: new Date().toISOString(),
    }).eq('license_key', row.license_key)
    if (error) setEmailErr(`저장 실패: ${error.message}`)
    else { setEmailMsg('이메일 저장됨'); onRefresh() }
  }

  async function resendEmail() {
    setEmailMsg(''); setEmailErr('')
    if (!form.email) { setEmailErr('이메일을 먼저 입력하고 저장하세요.'); return }
    const { error } = await supabase.functions.invoke('send-license-email', {
      body: { license_key: row.license_key, email: form.email, grade: form.grade },
    })
    if (error) setEmailErr(`발송 실패: ${error.message}`)
    else setEmailMsg('이메일 발송됨')
  }

  async function releaseHwId(hwid) {
    const next = hwIds.filter(h => h !== hwid)
    const { error } = await supabase.from('licenses').update({
      hw_ids: next,
      updated_at: new Date().toISOString(),
    }).eq('license_key', row.license_key)
    if (!error) { setHwIds(next); onRefresh() }
  }

  async function resetHwIds() {
    const { error } = await supabase.from('licenses').update({
      hw_ids: [],
      updated_at: new Date().toISOString(),
    }).eq('license_key', row.license_key)
    if (!error) { setHwIds([]); onRefresh() }
  }

  async function deleteLicense() {
    const { error } = await supabase.from('licenses').delete().eq('license_key', row.license_key)
    if (!error) { onRefresh(); onClose() }
  }

  async function generateUnlockCode() {
    setUnlockLoading(true); setUnlockCode(''); setUnlockErr(''); setUnlockEmailSent(false); setUnlockMaskedEmail('')
    const { data: { session } } = await supabase.auth.getSession()
    const { error, data } = await supabase.functions.invoke('generate-unlock-code', {
      body: { license_key: row.license_key },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
    setUnlockLoading(false)
    if (error) {
      let detail = error.message
      try { const b = await error.context?.json(); if (b?.error) detail = b.error } catch {}
      setUnlockErr(`발급 실패: ${detail}`)
      return
    }
    setUnlockCode(data.token)
    if (data.emailSent) {
      setUnlockEmailSent(true)
      setUnlockMaskedEmail(data.maskedEmail)
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.panel, width: 500 }} onClick={e => e.stopPropagation()}>
        <div style={styles.panelHeader}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>라이선스 상세</h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.panelBody}>
          {/* 기본 정보 (읽기 전용) */}
          <div style={styles.infoRow}>
            <span style={styles.infoKey}>라이선스 키</span>
            <code style={styles.code}>{row.license_key}</code>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoKey}>발급일</span>
            <span style={{ fontSize: 13 }}>{new Date(row.created_at).toLocaleString('ko-KR')}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoKey}>채널</span>
            <span style={{ fontSize: 13 }}>{row.channel ? `채널 ${row.channel}` : '—'}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoKey}>마지막 실행</span>
            <span style={{ fontSize: 13, color: row.last_validated_at ? 'var(--gray-700)' : 'var(--gray-400)' }}>
              {row.last_validated_at ? new Date(row.last_validated_at).toLocaleString('ko-KR') : '미설치'}
            </span>
          </div>

          <hr style={styles.hr} />

          {/* 기본 설정 */}
          <div style={styles.sectionTitle}>기본 설정</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={styles.field}>
              <label style={styles.label}>상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={styles.input}>
                {['ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
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
              <label style={styles.label}>최대 직원수 <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(비워두면 무제한)</span></label>
              <input type="number" value={form.max_emps} onChange={e => setForm(f => ({ ...f, max_emps: e.target.value }))} style={styles.input} min={1} placeholder="무제한" />
            </div>
            <div style={{ ...styles.field, gridColumn: '1 / -1' }}>
              <label style={styles.label}>최대 PC수 (max_users)</label>
              <input type="number" value={form.max_users} onChange={e => setForm(f => ({ ...f, max_users: e.target.value }))} style={styles.input} min={1} />
            </div>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>메모</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...styles.input, height: 56, resize: 'vertical' }} />
          </div>
          {saveErr && <p style={styles.errText}>{saveErr}</p>}
          {saveMsg && <p style={styles.okText}>{saveMsg}</p>}
          <button onClick={save} disabled={saving} style={{ ...styles.btnPrimary, width: '100%' }}>
            {saving ? '저장 중...' : '저장'}
          </button>

          <hr style={styles.hr} />

          {/* 이메일 */}
          <div style={styles.sectionTitle}>이메일</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="customer@example.com"
              style={{ ...styles.input, flex: 1 }}
            />
            <button onClick={saveEmail} style={{ ...styles.btnSm, whiteSpace: 'nowrap' }}>저장</button>
            <button onClick={resendEmail} style={{ ...styles.btnSm, whiteSpace: 'nowrap' }}>재발송</button>
          </div>
          {emailErr && <p style={styles.errText}>{emailErr}</p>}
          {emailMsg && <p style={styles.okText}>{emailMsg}</p>}

          <hr style={styles.hr} />

          {/* 설치된 PC */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={styles.sectionTitle}>설치된 PC ({hwIds.length}대)</div>
            {hwIds.length > 0 && (
              <button
                onClick={resetHwIds}
                style={{ ...styles.btnSm, color: 'var(--red-500)', borderColor: 'var(--red-200)', fontSize: 11 }}
              >
                전체 초기화
              </button>
            )}
          </div>
          {hwIds.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: 0 }}>설치된 PC 없음</p>
            : hwIds.map(hwid => (
              <div key={hwid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--gray-50)', borderRadius: 8, padding: '7px 12px', marginBottom: 6 }}>
                <code style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gray-600)', wordBreak: 'break-all' }}>{hwid}</code>
                <button
                  onClick={() => releaseHwId(hwid)}
                  style={{ ...styles.btnSm, fontSize: 11, padding: '2px 8px', marginLeft: 8, flexShrink: 0 }}
                >
                  해제
                </button>
              </div>
            ))
          }

          <hr style={styles.hr} />

          {/* 다운로드 이력 */}
          <div style={styles.sectionTitle}>다운로드 이력</div>
          {dlLoading
            ? <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: 0 }}>로딩 중...</p>
            : dlLogs.length === 0
              ? <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: 0 }}>다운로드 이력 없음</p>
              : dlLogs.map((log, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray-600)', padding: '5px 0', borderBottom: '1px solid var(--gray-50)' }}>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>v{log.version}</span>
                  <span>{new Date(log.downloaded_at).toLocaleString('ko-KR')}</span>
                </div>
              ))
          }

          <hr style={styles.hr} />

          {/* ADMIN 언락 코드 발급 */}
          <div style={styles.sectionTitle}>ADMIN 잠금 해제</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 8 }}>
            고객 ADMIN 계정이 비밀번호 오류로 잠긴 경우,<br />
            코드를 발급하면 등록 이메일로 자동 발송됩니다. (30분 유효)
          </div>
          {unlockCode ? (
            <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600, marginBottom: 6 }}>언락 코드 (30분 유효)</div>
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 10, color: '#7C3AED', fontFamily: 'monospace' }}>{unlockCode}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 6 }}>고객이 앱 복구 화면에 입력</div>
              {unlockEmailSent
                ? <div style={{ marginTop: 8, fontSize: 11, color: '#15803D', fontWeight: 600 }}>📧 {unlockMaskedEmail} 으로 자동 발송됨</div>
                : <div style={{ marginTop: 8, fontSize: 11, color: '#B45309' }}>⚠ 등록 이메일 없음 — 코드를 직접 전달하세요</div>
              }
            </div>
          ) : (
            <>
              <button
                onClick={generateUnlockCode}
                disabled={unlockLoading}
                style={{ ...styles.btnSm, color: '#7C3AED', borderColor: '#DDD6FE', width: '100%', padding: '9px', textAlign: 'center' }}
              >
                {unlockLoading ? '발급 중...' : '🔓 언락 코드 발급'}
              </button>
              {unlockErr && <p style={styles.errText}>{unlockErr}</p>}
            </>
          )}

          <hr style={styles.hr} />

          {/* 라이선스 삭제 */}
          {!confirmDelete
            ? (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ ...styles.btnSm, color: 'var(--red-500)', borderColor: 'var(--red-200)', width: '100%', padding: '9px', textAlign: 'center' }}
              >
                라이선스 삭제
              </button>
            )
            : (
              <div style={{ background: 'var(--red-100)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--red-500)', fontWeight: 600, margin: 0 }}>
                  정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={deleteLicense} style={{ ...styles.btnPrimary, background: 'var(--red-500)', flex: 1 }}>삭제 확인</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ ...styles.btnSm, flex: 1 }}>취소</button>
                </div>
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}

function IssueModal({ onClose, onRefresh }) {
  const [form, setForm] = useState({ grade: 'FREE', email: '', expires_at: '', notes: '', channel: 'A' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const [issueError, setIssueError] = useState('')

  async function issue() {
    setSaving(true)
    setIssueError('')
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
      max_emps: { FREE: 4, STARTER: 9, PRO: 29, ENTERPRISE: null }[form.grade] ?? 4,
    }).select().single()

    if (error) {
      setSaving(false)
      setIssueError(`발급 실패: ${error.message}`)
      return
    }

    if (form.email) {
      const { error: emailErr } = await supabase.functions.invoke('send-license-email', {
        body: { license_key: key, email: form.email, grade: form.grade },
      })
      if (emailErr) {
        setSaving(false)
        setIssueError(`라이선스 발급됨, 이메일 발송 실패: ${emailErr.message}`)
        onRefresh()
        return
      }
    }

    setSaving(false)
    setDone(data)
    onRefresh()
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
            <div style={{ color: '#15803D', fontWeight: 700, marginBottom: 8 }}>✓ 라이선스 발급 완료{form.email ? ' · 이메일 발송됨' : ''}</div>
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
          {issueError && <p style={{ fontSize: 12, color: 'var(--red-500)', background: 'var(--red-100)', borderRadius: 8, padding: '8px 12px', margin: 0 }}>{issueError}</p>}
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
  panelBody: { padding: 24, display: 'flex', flexDirection: 'column', gap: 10 },
  infoRow: { display: 'flex', alignItems: 'center', gap: 12 },
  infoKey: { width: 90, color: 'var(--gray-400)', fontWeight: 600, flexShrink: 0, fontSize: 12 },
  code: { fontFamily: 'monospace', fontSize: 12, background: 'var(--gray-100)', padding: '3px 8px', borderRadius: 6 },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--gray-600)' },
  input: { padding: '9px 12px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, outline: 'none' },
  closeBtn: { background: 'none', border: 'none', fontSize: 16, color: 'var(--gray-400)', padding: 4 },
  btnPrimary: { background: 'var(--blue-700)', color: 'white', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnSm: { background: 'white', border: '1px solid var(--blue-200)', color: 'var(--blue-700)', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  hr: { margin: '4px 0', border: 'none', borderTop: '1px solid var(--gray-100)' },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  errText: { fontSize: 12, color: 'var(--red-500)', background: 'var(--red-100)', borderRadius: 8, padding: '7px 12px', margin: 0 },
  okText: { fontSize: 12, color: '#15803D', background: 'var(--green-100)', borderRadius: 8, padding: '7px 12px', margin: 0 },
}
