export default function Placeholder({ title }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🚧</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#334155' }}>{title}</h2>
      <p style={{ fontSize: 13, color: '#94A3B8' }}>Phase 3 Supabase 연동 후 구현 예정</p>
    </div>
  )
}
