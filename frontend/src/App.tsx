import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ThemeProvider } from './lib/ThemeContext'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import ItemDetail from './pages/ItemDetail'
import AddPurchase from './pages/AddPurchase'
import RecordSale from './pages/RecordSale'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import FinancialDetail from './pages/FinancialDetail'

function BootScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3" role="status" aria-busy="true">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
        <span className="text-sm text-ink-muted">Loading…</span>
      </div>
    </div>
  )
}

function Gate({ children }: { children: React.ReactNode }) {
  const { session, shop, loading } = useAuth()
  if (loading) return <BootScreen />
  if (!session || !shop) return <Login />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <Gate>
                <Routes>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/items/:itemId" element={<ItemDetail />} />
                    <Route path="/purchase/new" element={<AddPurchase />} />
                    <Route path="/sale/new" element={<RecordSale />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/insights/:metric" element={<FinancialDetail />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </Gate>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
