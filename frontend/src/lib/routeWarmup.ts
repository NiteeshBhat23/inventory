import { prefetch } from './useQuery'

/** Route-level warm-up: pull a screen's code-split chunk *and* its data before
 *  the user clicks, so navigation becomes a cache read instead of a network wait.
 *
 *  Navigation used to be two serial round trips deep: React.lazy downloaded the
 *  route chunk (blank fallback on screen), the component then mounted, and only
 *  then issued its first fetch (skeleton on screen). Nothing but the dashboard
 *  was ever warmed, so every first visit to Stock/Insights/Revenue paid both.
 *
 *  The loaders below are the same function references App.tsx hands to
 *  React.lazy. Dynamic `import()` resolves to one cached module promise, so
 *  warming and rendering share a single download rather than racing. */

export const loadInventory = () => import('../pages/Inventory')
export const loadItemDetail = () => import('../pages/ItemDetail')
export const loadAddPurchase = () => import('../pages/AddPurchase')
export const loadRecordSale = () => import('../pages/RecordSale')
export const loadInsights = () => import('../pages/Insights')
export const loadSettings = () => import('../pages/Settings')
export const loadFinancialDetail = () => import('../pages/FinancialDetail')
export const loadPurchaseHistory = () => import('../pages/PurchaseHistory')

interface Warmup {
  load: () => Promise<unknown>
  /** Cache keys the screen reads on mount. These must match the page's own
   *  useQuery path character-for-character — a near-miss warms a key nothing
   *  ever reads and the skeleton comes back. */
  data?: string[]
}

const ROUTES: Record<string, Warmup> = {
  '/inventory': { load: loadInventory, data: ['/items'] },
  '/reports': { load: loadInsights, data: ['/insights?days=90'] },
  '/settings': { load: loadSettings },
  '/purchase/new': { load: loadAddPurchase },
  '/sale/new': { load: loadRecordSale },
  '/purchases/history': { load: loadPurchaseHistory, data: ['/purchases?days=90'] },
  '/insights/profit': { load: loadFinancialDetail, data: ['/sales?days=30'] },
  '/insights/revenue': { load: loadFinancialDetail, data: ['/sales?days=30'] },
}

function lookup(path: string): Warmup | undefined {
  // Strip the query so `/inventory?q=brake` still warms the Stock route.
  const clean = path.split('?')[0]
  const exact = ROUTES[clean]
  if (exact) return exact
  // Item detail is per-id, so only the chunk is shared and worth warming.
  if (clean.startsWith('/items/')) return { load: loadItemDetail }
  return undefined
}

/** Warms one route. Safe to call repeatedly — the module promise is cached by
 *  the browser and `prefetch` already skips paths that are cached or in flight. */
export function warmRoute(path: string): void {
  const entry = lookup(path)
  if (!entry) return
  void entry.load().catch(() => {
    /* best-effort; React.lazy surfaces a real failure at render time */
  })
  entry.data?.forEach(prefetch)
}

/** Props that warm a destination the moment the user shows intent — hovering,
 *  touching, or tabbing to it. On touch devices `touchstart` lands roughly
 *  100-200ms before the click, which is usually the whole round trip. */
export function warmOnIntent(path: string) {
  const fire = () => warmRoute(path)
  return { onPointerEnter: fire, onTouchStart: fire, onFocus: fire }
}

function onIdle(fn: () => void): () => void {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(fn, { timeout: 2000 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = setTimeout(fn, 200)
  return () => clearTimeout(handle)
}

/** Warms every reachable route in the background once the app is idle, one per
 *  idle slice so the screen the user is actually looking at keeps the main
 *  thread. Ordered by how likely each is to be opened next. */
export function warmAllRoutes(): () => void {
  const queue = [
    '/inventory',
    '/reports',
    '/insights/revenue',
    '/insights/profit',
    '/sale/new',
    '/purchase/new',
    '/settings',
    '/purchases/history',
  ]

  let cancelled = false
  let cancelPending = () => {}

  const step = () => {
    if (cancelled) return
    const next = queue.shift()
    if (!next) return
    warmRoute(next)
    cancelPending = onIdle(step)
  }

  cancelPending = onIdle(step)
  return () => {
    cancelled = true
    cancelPending()
  }
}
