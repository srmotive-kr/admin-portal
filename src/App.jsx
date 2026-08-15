import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import { ProductProvider, useProduct } from './lib/ProductContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import LicenseManager from './pages/LicenseManager'
import EmailHistory from './pages/EmailHistory'
import ReleaseManager from './pages/ReleaseManager'
import FreeRenewal from './pages/FreeRenewal'
import SeedEditor from './pages/SeedEditor'
import PlannerSeedEditor from './pages/PlannerSeedEditor'
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

// 특정 상품 전용 화면(제품 도메인 메뉴)을 다른 상품이 선택된 상태에서 URL 직접 접근으로
// 열어보는 것을 막는다 — 메뉴에서 숨기는 것만으로는 "접근 가능한 상태로 남아있으면 안 된다"는
// 완전 분리 원칙(멀티프로덕트_완전분리_가이드라인.md §0)을 만족하지 못하기 때문.
function ProductOnlyRoute({ product, children }) {
  const { productCode, loading } = useProduct()
  if (loading) return null
  if (productCode !== product) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
      이 메뉴는 현재 선택된 제품에서 사용할 수 없습니다.
    </div>
  )
  return children
}

// /seed는 상품마다 완전히 다른 화면(SeedEditor는 Smart HR+ 전용, PlannerSeedEditor는
// Smart Planner+ 전용) — 같은 컴포넌트를 공유하지 않고 상품별로 통째로 분기한다.
function SeedRoute() {
  const { productCode, loading } = useProduct()
  if (loading) return null
  if (productCode === 'smart-hr-plus') return <SeedEditor />
  if (productCode === 'smart-planner-plus') return <PlannerSeedEditor />
  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
      이 메뉴는 현재 선택된 제품에서 사용할 수 없습니다.
    </div>
  )
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
                  <Route path="/email-history" element={<EmailHistory />} />
                  <Route path="/releases" element={<ReleaseManager />} />
                  <Route path="/renewals" element={<FreeRenewal />} />
                  <Route path="/seed" element={<SeedRoute />} />
                  <Route path="/checklist" element={<ProductOnlyRoute product="smart-hr-plus"><ChecklistPage /></ProductOnlyRoute>} />
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
