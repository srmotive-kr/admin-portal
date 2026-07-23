import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useProduct } from '../lib/ProductContext'

const BUCKET = 'releases'

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
    let q = supabase.from('releases').select('*')
    if (productCode) q = q.eq('product_code', productCode)
    const { data } = await q.order('created_at', { ascending: false })
    setReleases(data || [])
    setLoading(false)
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setError('파일을 선택해주세요.')
    if (!form.version.trim()) return setError('버전을 입력해주세요.')
    setError(''); setSuccess(''); setUploading(true)

    try {
      const ext      = file.name.split('.').pop()
      const filePath = `${form.product_code}/${form.version}/${file.name}`

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, file, { upsert: true })
      if (upErr) throw new Error(upErr.message)

      const { error: dbErr } = await supabase.from('releases').insert({
        product_code: form.product_code,
        version:        form.version.trim(),
        file_path:      filePath,
        is_active:      false,
        notes:          form.notes.trim() || null,
        virustotal_url: form.virustotal_url.trim() || null,
      })
      if (dbErr) throw new Error(dbErr.message)

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
    if (!window.confirm(`v${rel.version} 을(를) 삭제하시겠습니까?\n스토리지 파일도 함께 삭제됩니다.`)) return
    await supabase.storage.from(BUCKET).remove([rel.file_path])
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
                {['버전','제품','파일 경로','노트','VirusTotal','등록일','상태','액션'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {releases.map(rel => (
                <tr key={rel.id} style={s.tr}>
                  <td style={s.td}><strong>v{rel.version}</strong></td>
                  <td style={s.td}><span style={s.code}>{rel.product_code}</span></td>
                  <td style={{ ...s.td, fontSize: 11, color: '#94A3B8', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rel.file_path}</td>
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
