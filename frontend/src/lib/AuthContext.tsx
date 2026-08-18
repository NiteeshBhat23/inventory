import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { ApiError, setAuthToken } from './apiClient'
import { fetchCached, invalidate, prefetch } from './useQuery'
import type { Shop } from './types'

interface AuthState {
  session: Session | null
  shop: Shop | null
  loading: boolean
  // False until the first shop lookup for this session has finished, one way
  // or the other. Without it, a fresh login renders a frame with `session` set
  // but `shop` still null, which is indistinguishable from "no shop yet" and
  // flashes the create-shop form at owners who already have one.
  //
  // Deliberately monotonic — it latches true and only resets on sign-out.
  // An "is a request in flight" flag would flip back on every background
  // refresh, and since the gate unmounts the whole shell while it is false,
  // that oscillated: shell mounts, refresh starts, shell unmounts, repeat.
  shopResolved: boolean
  // Set only when the shop lookup itself failed (network/server error) — as
  // opposed to a confirmed "you have no shop yet" (404), which just leaves
  // shopLoadError null and shop null so the create-shop form shows normally.
  shopLoadError: string | null
  // True from the moment Supabase detects a password-recovery link in the URL
  // until the user has set a new password (or signed out). The recovery link
  // signs the user in with a real session so they can call updateUser(), but
  // that session must not fall through to the normal app shell — the Gate
  // uses this flag to show the "set a new password" screen instead.
  passwordRecovery: boolean
  clearPasswordRecovery: () => void
  refreshShop: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthCtx = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [shop, setShop] = useState<Shop | null>(null)
  const [shopLoadError, setShopLoadError] = useState<string | null>(null)
  const [shopResolved, setShopResolved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  // The user id we last loaded a shop for. supabase-js re-emits SIGNED_IN for
  // an unchanged user on a timer (and on tab focus / token refresh); keying off
  // this makes the handler idempotent so only a genuine account change refetches.
  const loadedForUser = useRef<string | null>(null)

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
    } finally {
      setShopResolved(true)
    }
  }

  useEffect(() => {
    /** Loads the shop for a session, unless that user's shop is already loaded.
     *  Claims the user id synchronously, before the first await, so the boot
     *  lookup and the listener can't both fire a request for the same user. */
    async function ensureShopFor(next: Session | null) {
      const userId = next?.user?.id ?? null
      if (!userId) {
        loadedForUser.current = null
        setShop(null)
        setShopLoadError(null)
        setShopResolved(false)
        return
      }
      if (loadedForUser.current === userId) return
      loadedForUser.current = userId
      // Boot used to be strictly serial: session -> /shops/me -> render ->
      // /dashboard, three round trips deep before the first number appeared.
      // The dashboard doesn't depend on the shop response, so start it now
      // and let it land in the cache while /shops/me is still in flight —
      // Dashboard then paints from cache on its first render.
      prefetch('/dashboard?days=30')
      await refreshShop()
    }

    supabase.auth.getSession().then(async ({ data }) => {
      // Mirror the token before any request goes out, so the very first call
      // takes the synchronous path instead of re-awaiting getSession().
      setAuthToken(data.session)
      setSession(data.session)
      await ensureShopFor(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // Fired once supabase-js parses a recovery link's tokens out of the URL.
      // It carries a real session, but the user hasn't proven a new password
      // yet — flag it so the Gate can intercept before anything else renders.
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
      }
      setAuthToken(newSession)
      // Keep the previous object when the token is unchanged. supabase hands
      // us a fresh Session instance on every re-emission, and storing it would
      // re-render every consumer of this context several times a minute for no
      // actual change.
      setSession((prev) =>
        prev?.access_token === newSession?.access_token ? prev : newSession,
      )
      await ensureShopFor(newSession)
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
    setShopResolved(false)
    // Clear here too rather than waiting for the sign-out event, so signing
    // straight back in always reloads the shop.
    loadedForUser.current = null
    setPasswordRecovery(false)
  }

  return (
    <AuthCtx.Provider
      value={{
        session,
        shop,
        loading,
        shopResolved,
        shopLoadError,
        passwordRecovery,
        clearPasswordRecovery: () => setPasswordRecovery(false),
        refreshShop,
        signOut,
      }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
