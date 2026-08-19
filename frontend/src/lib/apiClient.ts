import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(typeof body === 'object' && body && 'detail' in (body as any) ? String((body as any).detail) : `API error ${status}`)
    this.status = status
    this.body = body
  }
}

/** Locally-mirrored access token.
 *
 *  Every request used to `await supabase.auth.getSession()` first, which is an
 *  async call that can hit the network to refresh an expiring token — a second
 *  round trip in front of every single API call. Supabase already pushes every
 *  session change to `onAuthStateChange`, so mirroring the token here makes the
 *  common path a synchronous property read and leaves the slow path (no token
 *  cached yet, e.g. a hard refresh mid-flight) as a one-time fallback. */
let cachedToken: string | null = null

export function setAuthToken(session: Session | null) {
  cachedToken = session?.access_token ?? null
}

async function resolveToken(): Promise<string | null> {
  if (cachedToken) return cachedToken
  const { data } = await supabase.auth.getSession()
  cachedToken = data.session?.access_token ?? null
  return cachedToken
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await resolveToken()
  // A FormData body must NOT carry an explicit Content-Type: the browser has
  // to set it itself so it can append the multipart boundary. Setting it here
  // produces a body the server cannot parse.
  const isFormData = options.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  // A cached token that has expired since we mirrored it shows up as a single
  // 401. Refresh once and retry rather than bouncing the user to the login
  // screen for what is really just a stale copy.
  if (res.status === 401 && cachedToken) {
    cachedToken = null
    const fresh = await resolveToken()
    if (fresh) {
      headers['Authorization'] = `Bearer ${fresh}`
      res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
    }
  }

  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* ignore parse failure */
    }
    throw new ApiError(res.status, body)
  }

  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('text/csv')) return (await res.text()) as unknown as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** Multipart upload with a hard time budget.
   *
   *  A vision call is the one request in this app that legitimately takes
   *  several seconds, and the model provider retries internally before giving
   *  up — so without an explicit ceiling a bad day looks like a spinner that
   *  never resolves. The abort turns that into an error the user can act on. */
  upload: <T>(path: string, form: FormData, timeoutMs = 60_000) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    return request<T>(path, { method: 'POST', body: form, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    )
  },
}
