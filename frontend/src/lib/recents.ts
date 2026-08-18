/** Small localStorage-backed "recently used" list, shared by the item and
 *  supplier typeaheads so both can show 2-3 likely picks before the owner
 *  has typed anything — the common case is re-buying the same handful of
 *  parts from the same handful of suppliers, not searching fresh every time. */

const MAX_STORED = 8

function key(namespace: string): string {
  return `profitpulse:recents:${namespace}`
}

export function getRecents(namespace: string): string[] {
  try {
    const raw = localStorage.getItem(key(namespace))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function pushRecent(namespace: string, value: string): void {
  const trimmed = value.trim()
  if (!trimmed) return
  try {
    const existing = getRecents(namespace).filter((v) => v.toLowerCase() !== trimmed.toLowerCase())
    const next = [trimmed, ...existing].slice(0, MAX_STORED)
    localStorage.setItem(key(namespace), JSON.stringify(next))
  } catch {
    /* localStorage unavailable (private mode, quota) — recents just won't persist */
  }
}
