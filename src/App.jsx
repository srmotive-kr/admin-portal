import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import { ProductProvider } from './lib/ProductContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import LicenseManager from './pages/LicenseManager'
import ReleaseManager from './pages/ReleaseManager'
import FreeRenewal from './pages/FreeRenewal'
import SeedEditor from './pages/SeedEditor'
import ChecklistPage from './pages/ChecklistPage'
import BroadcastManager from './pages/BroadcastManager'

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
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <AuthGuard>
            <ProductProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/licenses" element={<LicenseManager />} />
                  <Route path="/releases" element={<ReleaseManager />} />
                  <Route path="/renewals" element={<FreeRenewal />} />
                  <Route path="/seed" element={<SeedEditor />} />
                  <Route path="/checklist" element={<ChecklistPage />} />
                  <Route path="/broadcast" element={<BroadcastManager />} />
                </Routes>
              </Layout>
            </ProductProvider>
          </AuthGuard>
        } />
      </Routes>
    </HashRouter>
  )
}
