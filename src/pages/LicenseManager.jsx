import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useProduct } from '../lib/ProductContext'

// 등급 체계는 제품마다 다르다 — Smart HR+는 FREE/STARTER/PRO/ENTERPRISE(직원수 기준 4단계).
// Smart Planner+는 로컬 앱 licenseLimits.js의 FREE(개인 자가설계)/ADVISOR_FREE(설계사 무료)
// 두 등급이 이미 구현돼 있고, 유료 2단계(PRO/PRO_CRM)는 company-site 랜딩페이지 3단 가격표
// (PRO/PRO+CRM)와 이름을 맞췄다 — 정확한 PC수 등 사업조건은 licenseLimits.js에 이미 남겨진
// "TODO(사업 확정 필요)"와 동일하게 미확정이라, 당장은 HR+ PRO/ENTERPRISE 조건을 그대로
// 재사용한 임시값이다(가격을 그대로 재사용한 것과 같은 원칙).
const GRADE_OPTIONS_BY_PRODUCT = {
  'smart-planner-plus': ['FREE', 'ADVISOR_FREE', 'PRO', 'PRO_CRM'],
}
const DEFAULT_GRADE_OPTIONS = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE']
function gradeOptionsFor(productCode) {
  return GRADE_OPTIONS_BY_PRODUCT[productCode] || DEFAULT_GRADE_OPTIONS
}

const ISSUE_LIMITS_BY_PRODUCT = {
  'smart-planner-plus': {
    FREE:         { max_emps: null, max_users: 1 },
    ADVISOR_FREE: { max_emps: null, max_users: 1 },
    PRO:          { max_emps: null, max_users: 2 },
    PRO_CRM:      { max_emps: null, max_users: 0 },
  },
}
const DEFAULT_ISSUE_LIMITS = {
  FREE: { max_emps: 4, max_users: 1 }, STARTER: { max_emps: 9, max_users: 1 },
  PRO: { max_emps: 29, max_users: 2 }, ENTERPRISE: { max_emps: null, max_users: 4 },
}
export function issueLimitsFor(productCode, grade) {
  const table = ISSUE_LIMITS_BY_PRODUCT[productCode] || DEFAULT_ISSUE_LIMITS
  return table[grade] || DEFAULT_ISSUE_LIMITS.FREE
}

const GRADES = ['', ...DEFAULT_GRADE_OPTIONS]
const STATUSES = ['', 'ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED', 'DELETED']

// 채널 스킴 재정비(2026-09-16) — 예전 'A'/'E'(마켓/오프라인 수동발급)와 'WEB_FREE'/'WEB_ORDER'
// 두 체계가 뒤섞여 있었고, 목록 화면엔 'WEB_ORDER' 같은 원본값이 그대로 찍히는데 검색 필터는
// 'A'/'B'/'C'/'E'만 제공해 실제 값의 절반을 걸러낼 수 없던 문제를 고쳤다. APP_FREE_EXT는
// 앱 내 브라우저창을 통한 FREE 갱신용으로 예약해둔 값 — 결제 없는 갱신 경로가 아직
// 구현되지 않아 현재는 코드에서 실제로 부여되는 곳이 없다.
const CHANNEL_LABELS = {
  ADMIN_MKT: '마켓플레이스(수동)',
  ADMIN_OFFLINE: '오프라인/USB(수동)',
  WEB_FREE: '웹 무료신청',
  WEB_ORDER: '웹 결제',
  APP_FREE_EXT: '앱내 FREE갱신(예약)',
  APP_ORDER_EXT: '앱내 결제',
}
const CHANNELS = ['', ...Object.keys(CHANNEL_LABELS)]
function channelLabel(c) {
  if (!c) return '—'
  return CHANNEL_LABELS[c] || c
}

function GradeBadge({ grade }) {
  const map = { FREE: ['#EFF6FF', '#1D4ED8'], PRO: ['#F0FDF4', '#15803D'], ENTERPRISE: ['#FAF5FF', '#7E22CE'], STARTER: ['#FFF7ED', '#C2410C'] }
  const [bg, color] = map[grade] || ['var(--gray-100)', 'var(--gray-600)']
  return <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{grade}</span>
}

const STATUS_LABELS = { ACTIVE: '활성', PENDING: '대기', EXPIRED: '만료', REVOKED: '취소', DELETED: '삭제됨' }
function statusLabel(s) { return STATUS_LABELS[s] || s }
function statusOptionLabel(s) { return `${statusLabel(s)}(${s})` }

const PURCH_STATUS_LABELS = { PAID: '결제완료', PENDING: '결제대기', CANCELLED: '취소됨', FAILED: '실패' }
const PURCH_STATUS_COLORS = { PAID: '#15803D', PENDING: '#A16207', CANCELLED: 'var(--gray-400)', FAILED: 'var(--red-500)' }
function purchStatusLabel(s) { return PURCH_STATUS_LABELS[s] || s }

function StatusBadge({ status }) {
  const map = {
    ACTIVE: ['var(--green-100)', '#15803D', '●'],
    PENDING: ['var(--yellow-100)', '#A16207', '○'],
    EXPIRED: ['var(--gray-100)', 'var(--gray-500)', '✕'],
    REVOKED: ['var(--red-100)', 'var(--red-500)', '✕'],
    DELETED: ['var(--gray-200)', 'var(--gray-600)', '🗑'],
  }
  const [bg, color, icon] = map[status] || ['var(--gray-100)', 'var(--gray-500)', '']
  return <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{icon} {statusLabel(status)}</span>
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

// 만료일까지 남은 일수 — 시각은 무시하고 날짜 단위로만 비교(send-expiry-reminders와 동일 규칙)
function dDayFor(expiresAt) {
  const now = new Date()
  const expire = new Date(expiresAt)
  const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const expUTC = Date.UTC(expire.getFullYear(), expire.getMonth(), expire.getDate())
  return Math.round((expUTC - nowUTC) / 86400000)
}

const SEND_DELAY_MS = 500 // Resend 요청 간 지연 — 스팸/rate limit 방지
const EXTEND_MONTHS_OPTIONS = [1, 3, 6, 12]

function addMonths(dateStr, months) {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export default function LicenseManager() {
  const { productCode } = useProduct()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(null)
  // 채널 스킴 재정비(2026-09-16) — "+ 수동 발급" 하나였던 버튼을 마켓플레이스/오프라인
  // 두 경로로 이원화. null=닫힘, 'ADMIN_MKT'|'ADMIN_OFFLINE'=해당 채널로 발급 모달 오픈.
  const [issueChannel, setIssueChannel] = useState(null)
  const [filter, setFilter] = useState({ q: '', grade: '', status: '', channel: '' })
  const [page, setPage] = useState(0)
  const [dateField, setDateField] = useState('created_at') // created_at(발급일) | expires_at(만료일) — 입력 중인 값
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateApplied, setDateApplied] = useState(null) // null | { field, from, to } — 조회 버튼을 눌러야 반영됨
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null) // null | { done, total }
  const [bulkResult, setBulkResult] = useState(null) // null | { success, failed, skipped, failMsgs }
  const [showExtendModal, setShowExtendModal] = useState(false)
  const PAGE = 20

  async function load() {
    setLoading(true)
    setLoadError('')
    if (!productCode) { setRows([]); setTotal(0); setLoading(false); return }
    // email/biz_no/company_name/contact_name이 암호화 컬럼이라(2026-09-13) 직접 조회 대신
    // admin-licenses 함수가 서버에서 복호화해 내려준다.
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('admin-licenses', {
      body: {
        action: 'list', productCode, filter, dateApplied, q: filter.q || undefined,
        page, pageSize: PAGE,
      },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
    if (error) {
      let detail = error.message
      try { const b = await error.context?.json(); if (b?.error) detail = b.error } catch {}
      setLoadError(`데이터 조회 실패: ${detail}`)
      setRows([]); setTotal(0); setLoading(false)
      return
    }
    setRows(data.rows || [])
    setTotal(data.total || 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [filter, page, productCode, dateApplied])

  function handleDateSearch() {
    setPage(0)
    setDateApplied({ field: dateField, from: dateFrom, to: dateTo })
  }

  function handleCheck(id) {
    setRows(r => r.map(x => x.id === id ? { ...x, _checked: !x._checked } : x))
  }

  const checked = rows.filter(r => r._checked)

  async function sendBulkExpiryReminders() {
    const targets = checked.filter(r => r.email && r.expires_at && dDayFor(r.expires_at) >= 0)
    const skipped = checked.length - targets.length
    if (targets.length === 0) {
      setBulkResult({ success: 0, failed: 0, skipped, failMsgs: [] })
      return
    }

    setBulkSending(true)
    setBulkResult(null)
    setBulkProgress({ done: 0, total: targets.length })

    let success = 0
    const failMsgs = []

    for (const row of targets) {
      const days_left = dDayFor(row.expires_at)
      try {
        const { error } = await supabase.functions.invoke('send-license-email', {
          body: {
            license_key: row.license_key,
            email: row.email,
            grade: row.grade,
            type: 'expiry_reminder',
            days_left,
            expires_at: row.expires_at.slice(0, 10),
            product_code: row.product_code,
          },
        })
        if (error) throw error
        const notified = row.expiry_notified_days || []
        await supabase.from('licenses').update({
          expiry_notified_days: [...notified, days_left],
          updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        success++
      } catch (e) {
        failMsgs.push(`${row.email} (${row.license_key}): ${e.message}`)
      }
      setBulkProgress(p => ({ ...p, done: p.done + 1 }))
      await new Promise(r => setTimeout(r, SEND_DELAY_MS))
    }

    setBulkSending(false)
    setBulkProgress(null)
    setBulkResult({ success, failed: failMsgs.length, skipped, failMsgs })
    setRows(r => r.map(x => ({ ...x, _checked: false })))
    load()
  }

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>라이선스 관리 <span style={styles.totalBadge}>{total}건</span></h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.btnPrimary} onClick={() => setIssueChannel('ADMIN_MKT')}>+ 마켓플레이스 발급</button>
          <button style={styles.btnPrimary} onClick={() => setIssueChannel('ADMIN_OFFLINE')}>+ 오프라인 발급</button>
        </div>
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
          {gradeOptionsFor(productCode).map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filter.status} onChange={e => { setFilter(f => ({ ...f, status: e.target.value })); setPage(0) }} style={styles.select}>
          <option value="">상태 전체</option>
          {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{statusOptionLabel(s)}</option>)}
        </select>
        <select value={filter.channel} onChange={e => { setFilter(f => ({ ...f, channel: e.target.value })); setPage(0) }} style={styles.select}>
          <option value="">채널 전체</option>
          {CHANNELS.filter(Boolean).map(c => <option key={c} value={c}>{channelLabel(c)}</option>)}
        </select>
        <select value={dateField} onChange={e => setDateField(e.target.value)} style={styles.select}>
          <option value="created_at">발급일</option>
          <option value="expires_at">만료일</option>
        </select>
        <div style={styles.dateRange}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={styles.dateInput} />
          <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>~</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={styles.dateInput} />
        </div>
        <button onClick={handleDateSearch} style={styles.searchBtn}>조회</button>
      </div>

      {checked.length > 0 && (
        <div style={styles.bulkBar}>
          {checked.length}건 선택됨
          <button style={styles.btnSm} onClick={sendBulkExpiryReminders} disabled={bulkSending}>
            {bulkSending ? `발송 중... (${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0}건)` : '만료 안내 이메일 발송'}
          </button>
          <button style={styles.btnSm} onClick={() => setShowExtendModal(true)}>만료일 연장</button>
        </div>
      )}

      {bulkResult && (
        <div style={{
          background: bulkResult.failed > 0 ? 'var(--yellow-100)' : 'var(--green-100)',
          borderRadius: 10, padding: '10px 16px', marginBottom: 12, fontSize: 13,
        }}>
          <div style={{ fontWeight: 700, marginBottom: bulkResult.failMsgs.length > 0 ? 6 : 0 }}>
            발송 완료 — 성공 {bulkResult.success}건, 실패 {bulkResult.failed}건
            {bulkResult.skipped > 0 && `, 이메일·만료일 미등록 또는 이미 만료된 건 ${bulkResult.skipped}건 제외`}
          </div>
          {bulkResult.failMsgs.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--gray-700)' }}>
              {bulkResult.failMsgs.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          )}
          <button
            onClick={() => setBulkResult(null)}
            style={{ ...styles.btnSm, marginTop: 8, fontSize: 11, padding: '2px 10px' }}
          >
            닫기
          </button>
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
          <span style={{ flex: 2 }}>발급일</span>
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
                <span style={{ flex: 1, color: 'var(--gray-500)' }}>{channelLabel(row.channel)}</span>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: row.hw_ids?.length > 0 ? 'var(--blue-700)' : 'var(--gray-300)' }}>
                  {row.hw_ids?.length > 0 ? `${row.hw_ids.length}대` : '—'}
                </span>
                <span style={{ flex: 2, color: 'var(--gray-600)' }}>{fmt(row.created_at)}</span>
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
      {issueChannel && <IssueModal channel={issueChannel} onClose={() => setIssueChannel(null)} onRefresh={load} />}
      {showExtendModal && (
        <ExtendExpiryModal
          targets={checked}
          onClose={() => setShowExtendModal(false)}
          onDone={() => { setShowExtendModal(false); setRows(r => r.map(x => ({ ...x, _checked: false }))); load() }}
        />
      )}
    </div>
  )
}

function ExtendExpiryModal({ targets, onClose, onDone }) {
  const [months, setMonths] = useState(null)
  const [extending, setExtending] = useState(false)
  const [result, setResult] = useState(null)

  const applicable = targets.filter(r => r.expires_at)
  const skipped = targets.length - applicable.length

  async function run() {
    if (!months) return
    setExtending(true)
    let success = 0
    const failMsgs = []
    for (const row of applicable) {
      const update = {
        expires_at: addMonths(row.expires_at, months),
        expiry_notified_days: [], // 새 만료 주기이므로 이전 D-30/7/1 발송 기록 초기화
        updated_at: new Date().toISOString(),
      }
      if (row.status === 'EXPIRED') update.status = 'ACTIVE'
      const { error } = await supabase.from('licenses').update(update).eq('id', row.id)
      if (error) failMsgs.push(`${row.license_key}: ${error.message}`)
      else success++
    }
    setExtending(false)
    setResult({ success, failed: failMsgs.length, failMsgs })
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.panel, width: 420, height: 'auto', borderRadius: 14 }} onClick={e => e.stopPropagation()}>
        <div style={styles.panelHeader}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>만료일 연장</h3>
          <button onClick={result ? onDone : onClose} style={styles.closeBtn}>✕</button>
        </div>
        <div style={styles.panelBody}>
          {result ? (
            <>
              <div style={{
                background: result.failed > 0 ? 'var(--yellow-100)' : 'var(--green-100)',
                borderRadius: 10, padding: '10px 16px', fontSize: 13,
              }}>
                <div style={{ fontWeight: 700, marginBottom: result.failMsgs.length > 0 ? 6 : 0 }}>
                  연장 완료 — 성공 {result.success}건, 실패 {result.failed}건
                </div>
                {result.failMsgs.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--gray-700)' }}>
                    {result.failMsgs.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                )}
              </div>
              <button onClick={onDone} style={{ ...styles.btnPrimary, width: '100%', marginTop: 12 }}>확인</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--gray-600)', margin: 0 }}>
                선택한 {applicable.length}건의 만료일을 각 라이선스의 현재 만료일로부터 연장합니다.
                {skipped > 0 && ` (만료일 없는 ${skipped}건은 제외)`}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {EXTEND_MONTHS_OPTIONS.map(m => (
                  <button
                    key={m}
                    onClick={() => setMonths(m)}
                    style={{
                      ...styles.btnSm,
                      flex: 1, padding: '9px 0', textAlign: 'center',
                      ...(months === m ? { background: 'var(--blue-700)', color: 'white', borderColor: 'var(--blue-700)' } : {}),
                    }}
                  >
                    {m}개월
                  </button>
                ))}
              </div>
              <button
                onClick={run}
                disabled={!months || extending || applicable.length === 0}
                style={{ ...styles.btnPrimary, width: '100%', marginTop: 16, opacity: (!months || applicable.length === 0) ? 0.5 : 1 }}
              >
                {extending ? '연장 중...' : months ? `${months}개월 연장 실행` : '연장 기간을 선택하세요'}
              </button>
            </>
          )}
        </div>
      </div>
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
    company_name: row.company_name || '',
    contact_name: row.contact_name || '',
    biz_no: row.biz_no || '',
    phone: row.phone || '',
  })
  const [bizMsg, setBizMsg] = useState('')
  const [bizErr, setBizErr] = useState('')
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
  // 기본은 발송(기존 동작 유지) — §3-7 "2차 운영자 수동 개입" 절차처럼 등록 이메일 자체를
  // 더는 신뢰할 수 없는 상황에서만 체크 해제해서 그 이메일로 코드가 새어나가는 걸 막는다
  // (보안점검_2026-09-10.md §3-7 기존 결함, 2026-09-16 반영).
  const [unlockSendEmail, setUnlockSendEmail] = useState(true)

  // DEK 복구키 수동조회(§3-8, 2026-09-17) — 이메일 자동복구가 막혔을 때의 2차 운영자 개입.
  const [dekReason, setDekReason] = useState('')
  const [dekKey, setDekKey] = useState('')
  const [dekLoading, setDekLoading] = useState(false)
  const [dekErr, setDekErr] = useState('')

  const [purchLogs, setPurchLogs] = useState([])
  const [purchLoading, setPurchLoading] = useState(true)
  const [cancelingUid, setCancelingUid] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelErr, setCancelErr] = useState('')
  const [cancelMsg, setCancelMsg] = useState('')

  function loadPurchaseHistory() {
    setPurchLoading(true)
    supabase.from('purchase_history')
      .select('merchant_uid, grade, term_years, amount_paid, amount_expected, revival_promo_used, paid_at, created_at, channel, change_type, status, cancel_reason, cancelled_at')
      .eq('license_key', row.license_key)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { setPurchLogs(data || []); setPurchLoading(false) })
  }

  useEffect(() => {
    supabase.from('download_logs')
      .select('version, downloaded_at')
      .eq('license_key', row.license_key)
      .order('downloaded_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { setDlLogs(data || []); setDlLoading(false) })

    loadPurchaseHistory()
  }, [row.license_key])

  // 응급용 결제 취소 — 중복결제/오류결제 등 운영자가 예외적으로 처리해야 하는 상황 전용
  // (정상적인 고객 환불 경로가 아님, cancel-payment 함수 주석 참고).
  async function cancelPurchase(merchantUid) {
    if (!cancelReason.trim()) { setCancelErr('취소 사유를 입력해주세요.'); return }
    setCancelLoading(true); setCancelErr(''); setCancelMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('cancel-payment', {
      body: { merchant_uid: merchantUid, reason: cancelReason.trim() },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
    setCancelLoading(false)
    if (error) {
      let detail = error.message
      try { const b = await error.context?.json(); if (b?.error) detail = b.error } catch {}
      setCancelErr(`취소 실패: ${detail}`)
      return
    }
    setCancelMsg(data?.note || '결제가 취소되었습니다.')
    setCancelingUid(null); setCancelReason('')
    loadPurchaseHistory()
    onRefresh()
  }

  async function save() {
    setSaving(true); setSaveMsg(''); setSaveErr('')
    // 구매 이력에 수동 조정 이력도 남기려면 변경 전 값과 비교해야 해서(2026-09-16),
    // 이제 admin-licenses의 update_license 액션(서비스롤)을 거친다 — 등급/만료일이 실제로
    // 바뀐 경우에만 purchase_history에 ADMIN_UPDATE 행을 추가로 남긴다.
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.functions.invoke('admin-licenses', {
      body: {
        action: 'update_license', license_key: row.license_key,
        grade: form.grade, status: form.status,
        expires_at: form.expires_at || null, notes: form.notes || null,
        max_emps: form.max_emps !== '' ? Number(form.max_emps) : null,
        max_users: form.max_users !== '' ? Number(form.max_users) : null,
      },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
    setSaving(false)
    if (error) {
      let detail = error.message
      try { const b = await error.context?.json(); if (b?.error) detail = b.error } catch {}
      setSaveErr(`저장 실패: ${detail}`)
    } else { setSaveMsg('저장됨'); onRefresh() }
  }

  async function saveEmail() {
    setEmailMsg(''); setEmailErr('')
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('admin-licenses', {
      body: { action: 'update_email', license_key: row.license_key, email: form.email || null },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
    if (error) {
      let detail = error.message
      try { const b = await error.context?.json(); if (b?.error) detail = b.error } catch {}
      setEmailErr(`저장 실패: ${detail}`)
    } else {
      // 서버가 이메일 변경 시 이전 이메일을 메모에 날짜와 함께 누적 기록해 돌려준다 —
      // 새로고침 없이도 바로 보이도록 로컬 상태에 반영(2026-09-16).
      if (data?.notes !== undefined) setForm(f => ({ ...f, notes: data.notes || '' }))
      setEmailMsg('이메일 저장됨'); onRefresh()
    }
  }

  async function saveBizInfo() {
    setBizMsg(''); setBizErr('')
    const bizNoDigits = form.biz_no.replace(/\D/g, '')
    if (bizNoDigits && bizNoDigits.length !== 10) {
      setBizErr('사업자등록번호는 숫자 10자리여야 합니다.')
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.functions.invoke('admin-licenses', {
      body: {
        action: 'update_biz_info', license_key: row.license_key,
        company_name: form.company_name || null, contact_name: form.contact_name || null, biz_no: bizNoDigits || null,
        phone: form.phone || null,
      },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
    if (error) {
      let detail = error.message
      try { const b = await error.context?.json(); if (b?.error) detail = b.error } catch {}
      setBizErr(`저장 실패: ${detail}`)
    } else { setBizMsg('저장됨'); onRefresh() }
  }

  async function resendEmail() {
    setEmailMsg(''); setEmailErr('')
    if (!form.email) { setEmailErr('이메일을 먼저 입력하고 저장하세요.'); return }
    const { error } = await supabase.functions.invoke('send-license-email', {
      body: { license_key: row.license_key, email: form.email, grade: form.grade, product_code: row.product_code },
    })
    if (error) setEmailErr(`발송 실패: ${error.message}`)
    else setEmailMsg('이메일 발송됨')
  }

  async function sendExpiryReminder() {
    setEmailMsg(''); setEmailErr('')
    if (!form.email) { setEmailErr('이메일을 먼저 입력하고 저장하세요.'); return }
    if (!row.expires_at) { setEmailErr('만료일이 없는 라이선스입니다.'); return }
    const days_left = dDayFor(row.expires_at)
    if (days_left < 0) { setEmailErr('이미 만료된 라이선스입니다 — 만료 안내 발송은 만료 전에만 사용할 수 있습니다.'); return }
    const { error } = await supabase.functions.invoke('send-license-email', {
      body: {
        license_key: row.license_key, email: form.email, grade: form.grade,
        type: 'expiry_reminder', days_left, expires_at: row.expires_at.slice(0, 10),
        product_code: row.product_code,
      },
    })
    if (error) { setEmailErr(`발송 실패: ${error.message}`); return }
    const notified = row.expiry_notified_days || []
    await supabase.from('licenses').update({
      expiry_notified_days: [...notified, days_left],
      updated_at: new Date().toISOString(),
    }).eq('license_key', row.license_key)
    setEmailMsg('만료 안내 이메일 발송됨')
    onRefresh()
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

  // 하드 삭제 대신 status='DELETED'로 표시만 한다(2026-09-21) — 실수로 지웠을 때 되돌릴 수
  // 있어야 하고, purchase_history 등 참조 데이터도 그대로 보존해야 하므로 소프트 삭제로 변경.
  // 목록에서 사라지지 않고 "삭제됨" 상태로 계속 조회된다.
  async function deleteLicense() {
    const { error } = await supabase.from('licenses').update({
      status: 'DELETED', updated_at: new Date().toISOString(),
    }).eq('license_key', row.license_key)
    if (!error) { onRefresh(); onClose() }
  }

  async function generateUnlockCode() {
    setUnlockLoading(true); setUnlockCode(''); setUnlockErr(''); setUnlockEmailSent(false); setUnlockMaskedEmail('')
    const { data: { session } } = await supabase.auth.getSession()
    const { error, data } = await supabase.functions.invoke('generate-unlock-code', {
      body: { license_key: row.license_key, send_email: unlockSendEmail },
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

  async function fetchDekRecoveryKey() {
    if (!dekReason.trim()) { setDekErr('조회 사유를 입력해주세요.'); return }
    setDekLoading(true); setDekErr(''); setDekKey('')
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('admin-licenses', {
      body: { action: 'get_dek_recovery_key', license_key: row.license_key, reason: dekReason.trim() },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
    setDekLoading(false)
    if (error) {
      let detail = error.message
      try { const b = await error.context?.json(); if (b?.error) detail = b.error } catch {}
      setDekErr(detail)
      return
    }
    setDekKey(data.recoveryKey)
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
            <span style={{ fontSize: 13 }}>{channelLabel(row.channel)}</span>
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
                {['ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED', 'DELETED'].map(s => <option key={s} value={s}>{statusOptionLabel(s)}</option>)}
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>등급</label>
              <select
                value={form.grade}
                onChange={e => {
                  const grade = e.target.value
                  // 등급 변경 시 해당 등급의 기본 직원수/PC수 한도로 자동 갱신한다(2026-09-09) —
                  // 예전에는 등급만 바뀌고 max_emps/max_users는 이전 값 그대로 저장돼, 예를 들어
                  // PRO→ENTERPRISE로 바꿔도 PC 한도가 여전히 2대(PRO 값)로 남는 문제가 있었다.
                  // 특수 계약으로 기본값과 다른 한도가 필요하면 저장 전에 직접 수정하면 된다.
                  const limits = issueLimitsFor(row.product_code, grade)
                  setForm(f => ({
                    ...f, grade,
                    max_emps: limits.max_emps ?? '',
                    max_users: limits.max_users ?? '',
                  }))
                }}
                style={styles.input}
              >
                {gradeOptionsFor(row.product_code).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>만료일</label>
              <input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} style={styles.input} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>최대 직원수 <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(비워두면 무제한)</span></label>
              <input type="text" inputMode="numeric" value={form.max_emps} onChange={e => setForm(f => ({ ...f, max_emps: e.target.value }))} style={styles.input} placeholder="무제한" />
            </div>
            <div style={{ ...styles.field, gridColumn: '1 / -1' }}>
              <label style={styles.label}>최대 PC수 (max_users)</label>
              <input type="text" inputMode="numeric" value={form.max_users} onChange={e => setForm(f => ({ ...f, max_users: e.target.value }))} style={styles.input} />
            </div>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>메모</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...styles.input, height: 56, resize: 'vertical' }} />
          </div>
          {saveErr && <p style={styles.errText}>{saveErr}</p>}
          {saveMsg && <p style={styles.okText}>{saveMsg}</p>}
          <button onClick={save} disabled={saving} style={{ ...styles.btnPrimary, width: '100%' }}>
            {saving ? '저장 중...' : '라이선스정보 저장'}
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
            <button onClick={saveEmail} style={{ ...styles.btnSmPrimary, whiteSpace: 'nowrap' }}>이메일저장</button>
            <button onClick={resendEmail} style={{ ...styles.btnSm, whiteSpace: 'nowrap' }}>재발송</button>
          </div>
          {row.expires_at && dDayFor(row.expires_at) >= 0 && (
            <button onClick={sendExpiryReminder} style={{ ...styles.btnSm, alignSelf: 'flex-start' }}>
              📧 만료 안내 발송 (D-{dDayFor(row.expires_at)})
            </button>
          )}
          {row.expires_at && dDayFor(row.expires_at) < 0 && (
            <p style={{ fontSize: 11, color: 'var(--gray-400)', margin: 0 }}>
              이미 만료된 라이선스입니다 — 만료 안내 발송 대상이 아닙니다.
            </p>
          )}
          {emailErr && <p style={styles.errText}>{emailErr}</p>}
          {emailMsg && <p style={styles.okText}>{emailMsg}</p>}

          <hr style={styles.hr} />

          {/* 사업자정보 */}
          <div style={styles.sectionTitle}>사업자정보</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={styles.field}>
              <label style={styles.label}>회사명</label>
              <input
                type="text"
                value={form.company_name}
                onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                style={styles.input}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>
                사업자등록번호
                {row.biz_no && (
                  <span style={{ marginLeft: 6, fontWeight: 600, color: row.biz_no_verified ? '#15803D' : '#B45309' }}>
                    {row.biz_no_verified ? '✓ 국세청 확인됨' : '⚠ 미확인'}
                  </span>
                )}
              </label>
              <input
                type="text"
                value={form.biz_no}
                onChange={e => setForm(f => ({ ...f, biz_no: e.target.value }))}
                placeholder="000-00-00000"
                style={styles.input}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>담당자명</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                style={styles.input}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>휴대폰 번호</label>
              <input
                type="text"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="010-0000-0000"
                style={styles.input}
              />
            </div>
          </div>
          <button onClick={saveBizInfo} style={{ ...styles.btnSmPrimary, alignSelf: 'flex-start' }}>사업자정보 저장</button>
          {bizErr && <p style={styles.errText}>{bizErr}</p>}
          {bizMsg && <p style={styles.okText}>{bizMsg}</p>}

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

          {/* 구매 이력 — 승인(결제완료)과 취소는 서로 다른 시점에 일어난 별개 사건이므로
              한 건이 결제 후 취소됐다면 각각 독립된 행으로 나눠 보여준다. */}
          <div style={styles.sectionTitle}>구매 이력</div>
          {purchLoading
            ? <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: 0 }}>로딩 중...</p>
            : purchLogs.length === 0
              ? <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: 0 }}>구매 이력 없음</p>
              : purchLogs.flatMap(log => (
                  log.status === 'CANCELLED' && log.paid_at
                    ? [
                        { key: `${log.merchant_uid}-cancel`, log, eventType: 'CANCELLED', at: log.cancelled_at },
                        { key: `${log.merchant_uid}-paid`, log, eventType: 'PAID', at: log.paid_at },
                      ]
                    : [{ key: log.merchant_uid, log, eventType: log.status, at: log.paid_at || log.created_at }]
                )).map(({ key, log, eventType, at }) => (
                <div key={key} style={{ fontSize: 11.5, color: 'var(--gray-600)', padding: '7px 0', borderBottom: '1px solid var(--gray-50)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.15fr 52px 68px 74px', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.revival_promo_used ? '스페셜 프로모션 적용' : ''}>
                      {log.grade}{log.term_years > 0 ? ` · ${log.term_years}년` : ''}
                      {log.change_type === 'ADMIN_ISSUE' && ' · 수동발급'}
                      {log.change_type === 'ADMIN_UPDATE' && ' · 수동조정'}
                      {log.revival_promo_used && ' 🎁'}
                    </span>
                    <span style={{ color: 'var(--gray-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={at ? new Date(at).toLocaleString('ko-KR') : ''}>
                      {at ? fmt(at) : '—'}
                    </span>
                    <span style={{ color: PURCH_STATUS_COLORS[eventType] || 'var(--gray-400)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {eventType === 'PAID' ? '✔ 승인' : eventType === 'CANCELLED' ? '✕ 취소' : purchStatusLabel(eventType)}
                    </span>
                    <span style={{ color: 'var(--gray-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelLabel(log.channel)}</span>
                    <span style={{ fontWeight: 700, color: 'var(--gray-700)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {eventType === 'PAID' && log.amount_paid != null
                        ? `${Number(log.amount_paid).toLocaleString('ko-KR')}원`
                        : eventType === 'CANCELLED'
                          ? (log.amount_paid != null ? `-${Number(log.amount_paid).toLocaleString('ko-KR')}원` : '—')
                          : (log.amount_expected != null ? `예정 ${Number(log.amount_expected).toLocaleString('ko-KR')}원` : '—')}
                    </span>
                  </div>
                  {eventType === 'CANCELLED' && log.cancel_reason && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--gray-400)' }}>
                      취소 사유: {log.cancel_reason}
                    </div>
                  )}
                  {eventType === 'PAID' && log.status === 'PAID' && (log.change_type === 'NEW' || log.change_type === 'RENEW' || log.change_type === 'UPGRADE') && (cancelingUid === log.merchant_uid ? (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input
                        type="text"
                        value={cancelReason}
                        onChange={e => setCancelReason(e.target.value)}
                        placeholder="취소 사유 (예: 중복결제)"
                        style={styles.input}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => cancelPurchase(log.merchant_uid)}
                          disabled={cancelLoading}
                          style={{ ...styles.btnSm, color: 'var(--red-500)', borderColor: 'var(--red-200)', flex: 1, textAlign: 'center' }}
                        >
                          {cancelLoading ? '취소 처리 중...' : '결제 취소 확정'}
                        </button>
                        <button
                          onClick={() => { setCancelingUid(null); setCancelReason(''); setCancelErr('') }}
                          style={{ ...styles.btnSm, flex: 1, textAlign: 'center' }}
                        >
                          닫기
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setCancelingUid(log.merchant_uid); setCancelReason(''); setCancelErr(''); setCancelMsg('') }}
                      style={{ ...styles.btnSm, marginTop: 6, fontSize: 11, padding: '2px 8px', color: 'var(--red-500)', borderColor: 'var(--red-200)' }}
                    >
                      결제 취소
                    </button>
                  ))}
                </div>
              ))
          }
          {cancelErr && <p style={styles.errText}>{cancelErr}</p>}
          {cancelMsg && <p style={styles.okText}>{cancelMsg}</p>}

          <hr style={styles.hr} />

          {/* ADMIN 언락 코드 발급 */}
          <div style={styles.sectionTitle}>ADMIN 잠금 해제</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 8 }}>
            고객 ADMIN 계정이 비밀번호 오류로 잠긴 경우 코드를 발급합니다. (30분 유효)
          </div>
          {unlockCode ? (
            <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600, marginBottom: 6 }}>언락 코드 (30분 유효)</div>
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 10, color: '#7C3AED', fontFamily: 'monospace' }}>{unlockCode}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 6 }}>고객이 앱 복구 화면에 입력</div>
              {unlockEmailSent
                ? <div style={{ marginTop: 8, fontSize: 11, color: '#15803D', fontWeight: 600 }}>📧 {unlockMaskedEmail} 으로 자동 발송됨</div>
                : unlockSendEmail
                  ? <div style={{ marginTop: 8, fontSize: 11, color: '#B45309' }}>⚠ 등록 이메일 없음 — 코드를 직접 전달하세요</div>
                  : <div style={{ marginTop: 8, fontSize: 11, color: '#B45309' }}>⚠ 등록 이메일 발송 안 함(선택 해제) — 코드를 직접 전달하세요</div>
              }
            </div>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-600)', marginBottom: 8 }}>
                <input type="checkbox" checked={unlockSendEmail} onChange={e => setUnlockSendEmail(e.target.checked)} />
                등록 이메일로도 발송
              </label>
              {!unlockSendEmail && (
                <p style={{ fontSize: 11, color: '#B45309', margin: '0 0 8px' }}>
                  등록 이메일 자체를 신뢰할 수 없는 상황(2차 본인확인 절차)에서만 해제하세요 — 코드는 여기 화면에만 표시되고, 직접 전달해야 합니다.
                </p>
              )}
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

          {/* DEK 복구키 수동조회 — 이메일 자동복구(고객 셀프서비스)가 막혔을 때의 2차 운영자
              개입 경로. DEK는 고객 로컬 DB 전체를 여는 마스터키라 위 ADMIN 언락 코드보다
              훨씬 민감함 — 조회 사유를 필수로 받고 notes에 조회 이력을 남긴다. */}
          <div style={styles.sectionTitle}>DEK 복구키 수동조회</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 8 }}>
            고객이 PC교체 등으로 로컬 DB를 못 열고, 이메일 자동복구도 안 될 때만 사용합니다.
            실행 전 반드시 통화 등 별도 채널로 담당자 본인 확인을 먼저 완료하세요.
          </div>
          {dekKey ? (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#B91C1C', fontWeight: 600, marginBottom: 6 }}>DEK 복구키</div>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2, color: '#B91C1C', fontFamily: 'monospace', wordBreak: 'break-all' }}>{dekKey}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 8, lineHeight: 1.6 }}>
                고객이 앱의 "복구키를 알고 있습니다" 화면에 그대로 입력합니다.<br />
                이메일·슬랙 등에 평문으로 남기지 말고, 통화 등으로만 전달하세요.
              </div>
              <button
                onClick={() => { setDekKey(''); setDekReason('') }}
                style={{ ...styles.btnSm, marginTop: 10, width: '100%', textAlign: 'center' }}
              >
                화면에서 지우기
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={dekReason}
                onChange={e => setDekReason(e.target.value)}
                placeholder="조회 사유(예: PC 교체, 전화 통화로 본인확인 완료)"
                style={{ ...styles.input, height: 48, resize: 'vertical', marginBottom: 8 }}
              />
              <button
                onClick={fetchDekRecoveryKey}
                disabled={dekLoading || !dekReason.trim()}
                style={{ ...styles.btnSm, color: '#B91C1C', borderColor: '#FECACA', width: '100%', padding: '9px', textAlign: 'center' }}
              >
                {dekLoading ? '조회 중...' : '🔑 DEK 복구키 조회'}
              </button>
              {dekErr && <p style={styles.errText}>{dekErr}</p>}
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
                  정말 삭제하시겠습니까? 상태가 "삭제됨"으로 변경되며, 목록에는 계속 표시됩니다(상태를 다시 바꾸면 복구 가능).
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

// 만료일 기본값 — 발급 시점 + 1년(2026-09-16, 매번 직접 입력하던 것을 기본값으로 채우되
// 여전히 수정 가능하게 함). "비워두면 무기한"은 그대로 유효 — 이 기본값을 지우고 제출하면
// 이전처럼 무기한으로 발급된다.
function defaultExpiresAt() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

function IssueModal({ channel, onClose, onRefresh }) {
  const { productCode, current } = useProduct()
  const prefix = current?.license_prefix || 'SMHR'
  const [form, setForm] = useState({ grade: 'FREE', email: '', expires_at: defaultExpiresAt(), notes: '' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const [issueError, setIssueError] = useState('')

  async function issue() {
    setSaving(true)
    setIssueError('')
    const key = `${prefix}-${uuid4()}`
    const { data: { session } } = await supabase.auth.getSession()
    const { data: res, error } = await supabase.functions.invoke('admin-licenses', {
      body: {
        action: 'create', license_key: key, grade: form.grade, email: form.email || null,
        expires_at: form.expires_at || null, notes: form.notes || null, channel,
        product_code: productCode, ...issueLimitsFor(productCode, form.grade),
      },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    })

    if (error) {
      setSaving(false)
      let detail = error.message
      try { const b = await error.context?.json(); if (b?.error) detail = b.error } catch {}
      setIssueError(`발급 실패: ${detail}`)
      return
    }
    const data = res.license

    if (form.email) {
      const { error: emailErr } = await supabase.functions.invoke('send-license-email', {
        body: { license_key: key, email: form.email, grade: form.grade, product_code: productCode },
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
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>수동 라이선스 발급 — {channelLabel(channel)}</h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>
        <div style={styles.panelBody}>
          <div style={styles.field}>
            <label style={styles.label}>등급 *</label>
            <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} style={styles.input}>
              {gradeOptionsFor(productCode).map(g => <option key={g} value={g}>{g}</option>)}
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
  dateRange: { display: 'flex', alignItems: 'center', gap: 6 },
  dateInput: { padding: '9px 10px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'white', color: 'var(--gray-700)' },
  searchBtn: { padding: '9px 18px', background: 'var(--blue-700)', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
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
  btnSmPrimary: { background: 'var(--blue-700)', border: 'none', color: 'white', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  hr: { margin: '4px 0', border: 'none', borderTop: '1px solid var(--gray-100)' },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  errText: { fontSize: 12, color: 'var(--red-500)', background: 'var(--red-100)', borderRadius: 8, padding: '7px 12px', margin: 0 },
  okText: { fontSize: 12, color: '#15803D', background: 'var(--green-100)', borderRadius: 8, padding: '7px 12px', margin: 0 },
}
