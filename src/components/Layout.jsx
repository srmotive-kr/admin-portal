import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const NAV = [
  { to: '/', label: '대시보드', icon: '◈' },
  { to: '/licenses', label: '라이선스 관리', icon: '🔑' },
  { to: '/releases', label: '릴리즈 관리', icon: '📦' },
  { to: '/renewals', label: 'FREE 갱신 관리', icon: '♻️' },
  { to: '/seed', label: 'Seed 편집기', icon: '🗄️' },
  { to: '/checklist', label: '연간 관리 항목', icon: '📋' },
  { to: '/broadcast', label: '공지 관리', icon: '📢' },
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
          <div style={styles.logo} translate="no">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="515 663 2950 775" style={{ height: 32, width: 'auto', display: 'block' }} aria-label="SRMOTIVE">
              <path fill="#5B8FD6" fillRule="evenodd" transform="matrix(1.83697e-16 1 1 -1.83697e-16 542 810)" d="M0 519 0 178.936C-3.30379e-14 80.1125 80.1126 0 178.937 0L184.497 0C283.321-3.30378e-14 363.433 80.1125 363.433 178.936L363.433 281.324 406 281.324 304.5 281.324 203 281.324 245.567 281.324 245.567 178.936C245.567 145.208 218.225 117.866 184.497 117.866L178.937 117.866C145.208 117.866 117.866 145.208 117.866 178.936L117.866 519Z"/>
              <path fill="#5B8FD6" fillRule="evenodd" d="M1084 810 1421.86 810C1521.9 810 1603 891.099 1603 991.139L1603 991.139C1603 1091.18 1521.9 1172.28 1421.86 1172.28L1114.09 1172.28 1114.09 1215 1114.09 1113.75 1114.09 1012.5 1114.09 1055.22 1421.86 1055.22C1457.25 1055.22 1485.94 1026.53 1485.94 991.139L1485.94 991.139C1485.94 955.748 1457.25 927.057 1421.86 927.057L1084 927.057Z"/>
              <path fill="#5B8FD6" fillRule="evenodd" transform="matrix(1 -1.22465e-16 -1.22465e-16 -1 1114 1418)" d="M0 144.5 234 0 468 0 0 289Z"/>
              <path fill="#5B8FD6" fillRule="evenodd" transform="matrix(-6.12323e-17 -1 -1 6.12323e-17 1055 1418)" d="M0 520 0 179.707C-3.31015e-14 80.4574 80.4574 0 179.707 0L183.09 0C282.34-3.31015e-14 362.797 80.4574 362.797 179.707L362.797 232.981 405 232.981 303.75 232.981 202.5 232.981 244.703 232.981 244.703 179.707C244.703 145.679 217.118 118.094 183.09 118.094L179.707 118.094C145.679 118.094 118.094 145.678 118.094 179.706L118.094 520Z"/>
              <polyline fill="none" stroke="#FF6B6B" strokeWidth="38" strokeLinecap="round" strokeLinejoin="round" points="998,748 1042,806 1132,683"/>
              <text fill="#F4A456" fontFamily="'Sora','Century Gothic',sans-serif" fontWeight="700" fontSize="454" x="1591" y="1413">MOTIVE</text>
            </svg>
            <div style={styles.logoSub}>Admin Portal</div>
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
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    padding: '0 20px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  logoSub: { fontSize: 9, color: '#ffffff', letterSpacing: '1.5px', textTransform: 'uppercase' },
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
