import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ThemeProvider } from './lib/ThemeContext'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import Layout from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Logo from './components/Logo'
import {
  loadAddPurchase,
  loadFinancialDetail,
  loadInsights,
  loadInventory,
  loadItemDetail,
  loadPurchaseHistory,
  loadRecordSale,
  loadSettings,
} from './lib/routeWarmup'

// Dashboard and Login stay in the entry bundle — one of the two is always the
// first thing rendered, so deferring them would only add a round trip to the
// critical path. Everything else is code-split, but warmed during idle by
// routeWarmup rather than downloaded on first click, so splitting no longer
// costs a visible wait. These must be the loaders routeWarmup exports, or the
// warm copy and the rendered copy would be two separate downloads.
const Inventory = lazy(loadInventory)
const ItemDetail = lazy(loadItemDetail)
const AddPurchase = lazy(loadAddPurchase)
const RecordSale = lazy(loadRecordSale)
const Insights = lazy(loadInsights)
const Settings = lazy(loadSettings)
const FinancialDetail = lazy(loadFinancialDetail)
const PurchaseHistory = lazy(loadPurchaseHistory)

function BootScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas">
      {/* Pulse rather than spin: the mark is asymmetric, so a rotation reads
          as "broken" where a symmetric ring reads as "loading". */}
      <div className="flex flex-col items-center gap-3" role="status" aria-busy="true">
        <Logo size={40} className="animate-pulse" />
        <span className="text-sm text-ink-muted">Loading…</span>
      </div>
    </div>
  )
}

/** Chunk-load placeholder. Deliberately empty rather than a second spinner:
 *  the shell (header + nav) is already painted around it, and a route chunk
 *  on a warm cache resolves in a frame or two — flashing a spinner there
 *  reads as slower than showing nothing. */
function RouteFallback() {
  return <div className="min-h-[50vh]" aria-busy="true" />
}

function Gate({ children }: { children: React.ReactNode }) {
  const { session, shop, loading, shopResolved, passwordRecovery } = useAuth()
  if (loading) return <BootScreen />
  // A password-recovery link signs the user in with a real session, but they
  // must set a new password before landing in the app — this takes priority
  // over every other state below.
  if (passwordRecovery) return <ResetPassword />
  // A fresh login sets `session` before the shop lookup resolves — without
  // this, that one frame looks identical to "no shop yet" and flashes the
  // create-shop form at an owner who already has one.
  if (session && !shopResolved) return <BootScreen />
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
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route element={<Layout />}>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/inventory" element={<Inventory />} />
                      <Route path="/items/:itemId" element={<ItemDetail />} />
                      <Route path="/purchase/new" element={<AddPurchase />} />
                      <Route path="/sale/new" element={<RecordSale />} />
                      <Route path="/reports" element={<Insights />} />
                      <Route path="/insights/:metric" element={<FinancialDetail />} />
                      <Route path="/purchases/history" element={<PurchaseHistory />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                  </Routes>
                </Suspense>
              </Gate>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
