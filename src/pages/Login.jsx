import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const LAST_EMAIL_KEY = 'sr_admin_last_email'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) || '')
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
      localStorage.setItem(LAST_EMAIL_KEY, email)
      navigate('/')
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logo} translate="no">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="515 663 2950 775" style={{ height: 36, width: 'auto', display: 'block' }} aria-label="SRMOTIVE">
            <path fill="#2B5EA7" fillRule="evenodd" transform="matrix(1.83697e-16 1 1 -1.83697e-16 542 810)" d="M0 519 0 178.936C-3.30379e-14 80.1125 80.1126 0 178.937 0L184.497 0C283.321-3.30378e-14 363.433 80.1125 363.433 178.936L363.433 281.324 406 281.324 304.5 281.324 203 281.324 245.567 281.324 245.567 178.936C245.567 145.208 218.225 117.866 184.497 117.866L178.937 117.866C145.208 117.866 117.866 145.208 117.866 178.936L117.866 519Z"/>
            <path fill="#2B5EA7" fillRule="evenodd" d="M1084 810 1421.86 810C1521.9 810 1603 891.099 1603 991.139L1603 991.139C1603 1091.18 1521.9 1172.28 1421.86 1172.28L1114.09 1172.28 1114.09 1215 1114.09 1113.75 1114.09 1012.5 1114.09 1055.22 1421.86 1055.22C1457.25 1055.22 1485.94 1026.53 1485.94 991.139L1485.94 991.139C1485.94 955.748 1457.25 927.057 1421.86 927.057L1084 927.057Z"/>
            <path fill="#2B5EA7" fillRule="evenodd" transform="matrix(1 -1.22465e-16 -1.22465e-16 -1 1114 1418)" d="M0 144.5 234 0 468 0 0 289Z"/>
            <path fill="#2B5EA7" fillRule="evenodd" transform="matrix(-6.12323e-17 -1 -1 6.12323e-17 1055 1418)" d="M0 520 0 179.707C-3.31015e-14 80.4574 80.4574 0 179.707 0L183.09 0C282.34-3.31015e-14 362.797 80.4574 362.797 179.707L362.797 232.981 405 232.981 303.75 232.981 202.5 232.981 244.703 232.981 244.703 179.707C244.703 145.679 217.118 118.094 183.09 118.094L179.707 118.094C145.679 118.094 118.094 145.678 118.094 179.706L118.094 520Z"/>
            <polyline fill="none" stroke="#E53E3E" strokeWidth="38" strokeLinecap="round" strokeLinejoin="round" points="998,748 1042,806 1132,683"/>
            <text fill="#EF8B47" fontFamily="'Sora','Century Gothic',sans-serif" fontWeight="700" fontSize="454" x="1591" y="1413">MOTIVE</text>
          </svg>
          <div style={styles.logoSub}>Admin Portal</div>
        </div>

        <h2 style={styles.title}>관리자 로그인</h2>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
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
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    marginBottom: 32,
  },
  logoSub: {
    fontSize: 10,
    color: 'var(--gray-400)',
    letterSpacing: '2px',
    textTransform: 'uppercase',
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
