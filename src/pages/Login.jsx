import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>
            <span style={styles.logoSR}>SR</span>
            <div style={styles.logoDot} />
          </div>
          <div>
            <div style={styles.logoName}>SR<span style={{ color: 'var(--orange-500)' }}>MOTIVE</span></div>
            <div style={styles.logoSub}>Admin Portal</div>
          </div>
        </div>

        <h2 style={styles.title}>관리자 로그인</h2>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@srmotive.co.kr"
              required
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={styles.input}
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0F2462 0%, var(--blue-900) 50%, var(--blue-700) 100%)',
  },
  card: {
    background: 'white',
    borderRadius: 20,
    padding: '48px 44px',
    width: 400,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
    justifyContent: 'center',
  },
  logoIcon: {
    width: 44,
    height: 44,
    background: 'linear-gradient(135deg, var(--blue-600), var(--blue-900))',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    boxShadow: '0 2px 8px rgba(29,78,216,0.35)',
  },
  logoSR: {
    fontFamily: 'system-ui, sans-serif',
    fontWeight: 900,
    fontSize: 15,
    color: 'white',
    letterSpacing: '-0.5px',
  },
  logoDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 11,
    height: 11,
    background: 'var(--orange-500)',
    borderRadius: '50%',
    border: '2px solid white',
  },
  logoName: {
    fontFamily: 'system-ui, sans-serif',
    fontWeight: 900,
    fontSize: 20,
    color: 'var(--blue-900)',
    lineHeight: 1,
  },
  logoSub: {
    fontSize: 10,
    color: 'var(--gray-400)',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--gray-900)',
    marginBottom: 28,
    textAlign: 'center',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' },
  input: {
    padding: '11px 14px',
    border: '1.5px solid var(--gray-200)',
    borderRadius: 10,
    fontSize: 14,
    color: 'var(--gray-900)',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  error: {
    fontSize: 13,
    color: 'var(--red-500)',
    background: 'var(--red-100)',
    borderRadius: 8,
    padding: '8px 12px',
  },
  btn: {
    marginTop: 8,
    background: 'var(--blue-700)',
    color: 'white',
    border: 'none',
    borderRadius: 10,
    padding: '13px',
    fontSize: 15,
    fontWeight: 700,
    transition: 'background 0.15s',
  },
}
