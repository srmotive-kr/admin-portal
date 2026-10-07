import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useProduct } from '../lib/ProductContext'

const SUPABASE_URL = 'https://nwrcbcoqcsactnskdotc.supabase.co'

export default function ReleaseManager() {
  const { products, productCode } = useProduct()
  const [releases, setReleases]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [form, setForm]           = useState({ version: '', product_code: productCode, notes: '', virustotal_url: '' })
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const fileRef                   = useRef()

  useEffect(() => { fetchReleases() }, [productCode])
  useEffect(() => { setForm(f => ({ ...f, product_code: productCode })) }, [productCode])

  async function fetchReleases() {
    setLoading(true)
    if (!productCode) { setReleases([]); setLoading(false); return }
    const { data } = await supabase.from('releases').select('*').eq('product_code', productCode).order('created_at', { ascending: false })
    setReleases(data || [])
    setLoading(false)
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setError('파일을 선택해주세요.')
    if (!form.version.trim()) return setError('버전을 입력해주세요.')
    setError(''); setSuccess(''); setUploading(true)

    try {
      // 자동 업데이트 클라이언트가 다운로드 후 무결성을 검증할 수 있도록 SHA-256/파일크기를
      // 업로드 시점에 미리 계산해둔다(자동업데이트_도입방안.md §4.2, 2026-08-12).
      const fileBuffer  = await file.arrayBuffer()
      const digest      = await crypto.subtle.digest('SHA-256', fileBuffer)
      const sha256      = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')

      // 설치파일은 Supabase Storage가 아니라 GitHub Releases(비공개 저장소)로 보낸다 — Storage
      // 전역 업로드 한도가 Free 플랜 50MB 고정이라 100MB대 설치파일을 올릴 수 없었음(2026-10-07
      // 전환). upload-github-release 함수가 이 요청 바디를 그대로 GitHub에 스트리밍 전달하고
      // releases 테이블까지 함께 갱신한다 — 토큰은 그 함수 안에서만 쓰여 브라우저엔 노출되지 않음.
      const { data: { session } } = await supabase.auth.getSession()
      const params = new URLSearchParams({
        product_code: form.product_code,
        version: form.version.trim(),
        filename: file.name,
        sha256,
        file_size: String(file.size),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        ...(form.virustotal_url.trim() ? { virustotal_url: form.virustotal_url.trim() } : {}),
      })
      const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-github-release?${params}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token || ''}`,
          'Content-Type': 'application/octet-stream',
        },
        body: file,
        duplex: 'half',
      })
      const result = await res.json()
      if (!res.ok || result.error) throw new Error(result.error || '업로드 실패')

      setSuccess(`v${form.version} 업로드 완료!`)
      setForm(f => ({ ...f, version: '', notes: '', virustotal_url: '' }))
      fileRef.current.value = ''
      fetchReleases()
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function toggleActive(rel) {
    if (!rel.is_active) {
      // 활성화: 같은 product_code의 기존 활성 해제 후 이걸 활성화
      await supabase.from('releases').update({ is_active: false }).eq('product_code', rel.product_code)
    }
    await supabase.from('releases').update({ is_active: !rel.is_active }).eq('id', rel.id)
    fetchReleases()
  }

  async function handleDelete(rel) {
    // 설치파일 자체는 GitHub Releases에 있어 여기서는 지우지 않는다(삭제 자동화는 별도 작업으로
    // 미룸) — DB 레코드만 삭제되므로 목록/다운로드 연결만 끊어지고, 실제 파일은 GitHub
    // srmotive-kr/smart-hr-plus-releases 저장소에서 운영자가 직접 정리해야 한다.
    if (!window.confirm(`v${rel.version} 을(를) 삭제하시겠습니까?\n(GitHub Releases의 실제 파일은 지워지지 않습니다 — 저장소에서 직접 삭제하세요)`)) return
    await supabase.from('releases').delete().eq('id', rel.id)
    fetchReleases()
  }

  return (
    <div>
      <h2 style={s.pageTitle}>릴리즈 관리</h2>

      {/* 업로드 폼 */}
      <div style={s.card}>
        <div style={s.cardTitle}>새 릴리즈 업로드</div>
        <div style={s.formRow}>
          <div style={s.field}>
            <label style={s.label}>제품 코드</label>
            <select style={s.input} value={form.product_code} onChange={e => setForm(f => ({ ...f, product_code: e.target.value }))}>
              {products.map(p => (
                <option key={p.code} value={p.code}>{p.display_name}</option>
              ))}
            </select>
          </div>
          <div style={s.field}>
            <label style={s.label}>버전 <span style={{ color: '#EF4444' }}>*</span></label>
            <input style={s.input} placeholder="예: 1.2.0" value={form.version}
              onChange={e => setForm(f => ({ ...f, version: e.target.value }))} />
          </div>
          <div style={{ ...s.field, flex: 2 }}>
            <label style={s.label}>릴리즈 노트</label>
            <input style={s.input} placeholder="간단한 변경 사항" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div style={s.formRow}>
          <div style={{ ...s.field, flex: 3 }}>
            <label style={s.label}>VirusTotal URL</label>
            <input style={s.input} placeholder="https://www.virustotal.com/gui/file/..." value={form.virustotal_url}
              onChange={e => setForm(f => ({ ...f, virustotal_url: e.target.value }))} />
          </div>
        </div>
        <div style={s.formRow}>
          <div style={{ ...s.field, flex: 3 }}>
            <label style={s.label}>설치 파일 <span style={{ color: '#EF4444' }}>*</span></label>
            <input ref={fileRef} type="file" accept=".exe,.dmg,.zip,.AppImage" style={s.fileInput} />
          </div>
          <div style={{ ...s.field, alignSelf: 'flex-end' }}>
            <button style={{ ...s.btn, opacity: uploading ? 0.6 : 1 }} onClick={handleUpload} disabled={uploading}>
              {uploading ? '업로드 중...' : '업로드'}
            </button>
          </div>
        </div>
        {error   && <div style={s.error}>{error}</div>}
        {success && <div style={s.success}>{success}</div>}
      </div>

      {/* 릴리즈 목록 */}
      <div style={s.card}>
        <div style={s.cardTitle}>릴리즈 목록</div>
        {loading ? (
          <div style={s.empty}>로딩 중...</div>
        ) : releases.length === 0 ? (
          <div style={s.empty}>등록된 릴리즈가 없습니다.</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                {['버전','제품','파일명','GitHub','노트','VirusTotal','등록일','상태','액션'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {releases.map(rel => (
                <tr key={rel.id} style={s.tr}>
                  <td style={s.td}><strong>v{rel.version}</strong></td>
                  <td style={s.td}><span style={s.code}>{rel.product_code}</span></td>
                  <td style={{ ...s.td, fontSize: 11, color: '#94A3B8', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rel.file_path || '-'}</td>
                  <td style={s.td}>
                    {rel.github_repo && rel.github_release_tag
                      ? <a href={`https://github.com/${rel.github_repo}/releases/tag/${rel.github_release_tag}`} target="_blank" rel="noreferrer" style={s.vtLink}>저장소 보기</a>
                      : <span style={{ color: '#94A3B8' }}>-</span>}
                  </td>
                  <td style={s.td}>{rel.notes || '-'}</td>
                  <td style={s.td}>
                    {rel.virustotal_url
                      ? <a href={rel.virustotal_url} target="_blank" rel="noreferrer" style={s.vtLink}>결과 보기</a>
                      : <span style={{ color: '#94A3B8' }}>-</span>}
                  </td>
                  <td style={s.td}>{rel.created_at?.slice(0, 10)}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: rel.is_active ? '#16A34A' : '#475569' }}>
                      {rel.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={rel.is_active ? s.btnOutline : s.btnGreen} onClick={() => toggleActive(rel)}>
                        {rel.is_active ? '비활성화' : '활성화'}
                      </button>
                      <button style={s.btnRed} onClick={() => handleDelete(rel)}>삭제</button>
                    </div>
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
  pageTitle: { fontSize: 22, fontWeight: 700, color: '#1E293B', marginBottom: 24 },
  card: { background: '#fff', borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#1E293B', marginBottom: 16 },
  formRow: { display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 140 },
  label: { fontSize: 12, fontWeight: 600, color: '#374151' },
  input: { padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  fileInput: { padding: '6px 0', fontSize: 13 },
  btn: { padding: '9px 20px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', whiteSpace: 'nowrap' },
  btnOutline: { padding: '5px 10px', background: 'transparent', border: '1px solid #CBD5E0', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#64748B', fontFamily: 'inherit' },
  btnGreen: { padding: '5px 10px', background: '#16A34A', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' },
  btnRed: { padding: '5px 10px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' },
  error: { background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginTop: 8 },
  success: { background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#16A34A', marginTop: 8 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748B', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #F8FAFC' },
  td: { padding: '12px 12px', fontSize: 13, color: '#1E293B', verticalAlign: 'middle' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#fff' },
  code: { background: '#F1F5F9', padding: '2px 8px', borderRadius: 6, fontSize: 11, color: '#475569', fontFamily: 'monospace' },
  empty: { textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 14 },
  vtLink: { color: '#2563EB', fontSize: 12, textDecoration: 'none', fontWeight: 600 },
}
