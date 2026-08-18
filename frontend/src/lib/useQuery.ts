import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './apiClient'

/** Tiny stale-while-revalidate cache for GET endpoints.
 *
 *  Every page used to refetch from scratch on mount with nothing shared
 *  between them, so Dashboard -> Reports -> Dashboard paid full network
 *  latency three times and showed a skeleton each time. This keeps the last
 *  response per URL, so a revisit paints instantly from cache and refreshes in
 *  the background.
 *
 *  Deliberately ~60 lines rather than a data-fetching library: the app makes
 *  plain authenticated GETs against a handful of endpoints, and a dependency
 *  would cost more bytes on the wire than the feature is worth. */

interface Entry<T> {
  data: T
  at: number
}

const cache = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

/** How long a cached response is served without a background refresh. */
const FRESH_MS = 30_000

/** Drops cached entries whose key contains any of the given fragments. Called
 *  after a write so the next read reflects it rather than a stale copy. */
export function invalidate(...fragments: string[]) {
  for (const key of [...cache.keys()]) {
    if (fragments.some((f) => key.includes(f))) cache.delete(key)
  }
}

/** Fetches and caches, collapsing concurrent callers onto one request. */
export function fetchCached<T>(path: string): Promise<T> {
  const existing = inflight.get(path)
  if (existing) return existing as Promise<T>

  const p = api
    .get<T>(path)
    .then((data) => {
      cache.set(path, { data, at: Date.now() })
      return data
    })
    .finally(() => {
      inflight.delete(path)
    })

  inflight.set(path, p)
  return p
}

/** Warms the cache without subscribing — used to start a fetch before the
 *  component that needs it has mounted. */
export function prefetch(path: string): void {
  if (cache.has(path) || inflight.has(path)) return
  void fetchCached(path).catch(() => {
    /* prefetch is best-effort; the mounting component surfaces real errors */
  })
}

export function peek<T>(path: string): T | undefined {
  return cache.get(path)?.data as T | undefined
}

export function useQuery<T>(path: string | null) {
  const cached = path ? peek<T>(path) : undefined
  const [data, setData] = useState<T | undefined>(cached)
  // Only show a skeleton when there is genuinely nothing to paint.
  const [loading, setLoading] = useState(cached === undefined)
  const [error, setError] = useState<unknown>(null)
  const pathRef = useRef(path)
  pathRef.current = path

  const run = useCallback(
    (force: boolean) => {
      if (!path) return
      const hit = cache.get(path)
      const fresh = hit && Date.now() - hit.at < FRESH_MS

      if (hit) {
        setData(hit.data as T)
        setLoading(false)
        if (fresh && !force) return
      } else {
        setLoading(true)
      }

      fetchCached<T>(path)
        .then((d) => {
          // A slow response for a path we've since navigated away from must
          // not overwrite the current screen's data.
          if (pathRef.current === path) {
            setData(d)
            setError(null)
          }
        })
        .catch((e) => {
          if (pathRef.current === path) setError(e)
        })
        .finally(() => {
          if (pathRef.current === path) setLoading(false)
        })
    },
    [path],
  )

  useEffect(() => {
    setData(path ? peek<T>(path) : undefined)
    run(false)
  }, [path, run])

  const refetch = useCallback(() => {
    if (path) cache.delete(path)
    run(true)
  }, [path, run])

  return { data, loading, error, refetch }
}
