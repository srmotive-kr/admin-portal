import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import LicenseManager from './pages/LicenseManager'
import Placeholder from './pages/Placeholder'

function AuthGuard({ children }) {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94A3B8', fontSize: 14 }}>
      로딩 중...
    </div>
  )
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <AuthGuard>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/licenses" element={<LicenseManager />} />
                <Route path="/releases" element={<Placeholder title="릴리즈 관리" />} />
                <Route path="/renewals" element={<Placeholder title="FREE 갱신 관리" />} />
                <Route path="/seed" element={<Placeholder title="Seed Data 편집기" />} />
              </Routes>
            </Layout>
          </AuthGuard>
        } />
      </Routes>
    </BrowserRouter>
  )
}
