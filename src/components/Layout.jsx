import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const NAV = [
  { to: '/', label: '대시보드', icon: '◈' },
  { to: '/licenses', label: '라이선스 관리', icon: '🔑' },
  { to: '/releases', label: '릴리즈 관리', icon: '📦' },
  { to: '/renewals', label: 'FREE 갱신 관리', icon: '♻️' },
  { to: '/seed', label: 'Seed 편집기', icon: '🗄️' },
]

export default function Layout({ children }) {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
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

          <nav style={styles.nav}>
            {NAV.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navActive : {}) })}
              >
                <span style={styles.navIcon}>{icon}</span>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <button onClick={handleLogout} style={styles.logoutBtn}>
          로그아웃
        </button>
      </aside>

      {/* Main */}
      <main style={styles.main}>
        {children}
      </main>
    </div>
  )
}

const styles = {
  shell: {
    display: 'flex',
    minHeight: '100vh',
  },
  sidebar: {
    width: 'var(--sidebar-w)',
    background: 'var(--gray-900)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '24px 0',
    position: 'fixed',
    top: 0, left: 0, bottom: 0,
    zIndex: 10,
  },
  sidebarTop: { display: 'flex', flexDirection: 'column', gap: 0 },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 20px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  logoIcon: {
    width: 36,
    height: 36,
    background: 'linear-gradient(135deg, var(--blue-500), var(--blue-900))',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  logoSR: { fontFamily: 'system-ui', fontWeight: 900, fontSize: 13, color: 'white', letterSpacing: '-0.5px' },
  logoDot: {
    position: 'absolute', top: -2, right: -2,
    width: 9, height: 9,
    background: 'var(--orange-500)', borderRadius: '50%', border: '2px solid var(--gray-900)',
  },
  logoName: { fontFamily: 'system-ui', fontWeight: 900, fontSize: 16, color: 'white', lineHeight: 1 },
  logoSub: { fontSize: 9, color: 'var(--gray-500)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 2 },
  nav: { display: 'flex', flexDirection: 'column', padding: '0 10px', gap: 2 },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 10,
    fontSize: 13.5,
    fontWeight: 500,
    color: 'var(--gray-400)',
    transition: 'all 0.15s',
  },
  navActive: {
    background: 'rgba(59,130,246,0.12)',
    color: 'var(--blue-500)',
    fontWeight: 700,
  },
  navIcon: { fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 },
  logoutBtn: {
    margin: '0 10px',
    padding: '10px 12px',
    background: 'none',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    color: 'var(--gray-500)',
    fontSize: 13,
    textAlign: 'left',
    transition: 'all 0.15s',
  },
  main: {
    marginLeft: 'var(--sidebar-w)',
    flex: 1,
    minHeight: '100vh',
    padding: '32px',
  },
}
