import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { ApiError, setAuthToken } from './apiClient'
import { fetchCached, invalidate, prefetch } from './useQuery'
import type { Shop } from './types'

interface AuthState {
  session: Session | null
  shop: Shop | null
  loading: boolean
  // Set only when the shop lookup itself failed (network/server error) — as
  // opposed to a confirmed "you have no shop yet" (404), which just leaves
  // shopLoadError null and shop null so the create-shop form shows normally.
  shopLoadError: string | null
  refreshShop: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthCtx = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [shop, setShop] = useState<Shop | null>(null)
  const [shopLoadError, setShopLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function refreshShop() {
    try {
      invalidate('/shops/me')
      const s = await fetchCached<Shop>('/shops/me')
      setShop(s)
      setShopLoadError(null)
    } catch (err) {
      setShop(null)
      if (err instanceof ApiError && err.status === 404) {
        // Expected: no shop profile created yet — not an error condition.
        setShopLoadError(null)
      } else {
        // Network failure, 500, etc. — do NOT treat this the same as "no
        // shop yet", or the UI loops on the create-shop form and fails with
        // "already exists" if one was in fact already created.
        setShopLoadError(
          err instanceof ApiError
            ? err.message
            : 'Could not reach the server. Check that the backend is running and try again.',
        )
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // Mirror the token before any request goes out, so the very first call
      // takes the synchronous path instead of re-awaiting getSession().
      setAuthToken(data.session)
      setSession(data.session)
      if (data.session) {
        // Boot used to be strictly serial: session -> /shops/me -> render ->
        // /dashboard, three round trips deep before the first number appeared.
        // The dashboard doesn't depend on the shop response, so start it now
        // and let it land in the cache while /shops/me is still in flight —
        // Dashboard then paints from cache on its first render.
        prefetch('/dashboard?days=30')
        await refreshShop()
      }
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setAuthToken(newSession)
      setSession(newSession)
      if (newSession) {
        prefetch('/dashboard?days=30')
        await refreshShop()
      } else {
        setShop(null)
        setShopLoadError(null)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setAuthToken(null)
    // Never let one account's cached rows show up under the next login.
    invalidate('/')
    setShop(null)
    setShopLoadError(null)
  }

  return (
    <AuthCtx.Provider value={{ session, shop, loading, shopLoadError, refreshShop, signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
