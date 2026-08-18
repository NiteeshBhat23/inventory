/** Shared number formatting.
 *
 * Previously each page hand-rolled `₹${n.toFixed(2)}` or its own toLocaleString
 * call, so the same value rendered three different ways across the app. Routing
 * everything through here keeps the Indian digit grouping (1,40,000 not 140,000)
 * consistent and makes currency changes a one-line edit. */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const INR_PRECISE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const QTY = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

/** Rounded — for dashboards, totals, and anywhere the paisa is noise. */
export function money(n: number | null | undefined): string {
  return INR.format(Number(n ?? 0))
}

/** Two decimals — for unit costs and prices, where the paisa is the point. */
export function moneyPrecise(n: number | null | undefined): string {
  return INR_PRECISE.format(Number(n ?? 0))
}

/** Drops trailing ".00" so stock reads "8" not "8.00", but keeps "2.5". */
export function qty(n: number | null | undefined): string {
  return QTY.format(Number(n ?? 0))
}

export function percent(n: number | null | undefined): string {
  return `${Math.round(Number(n ?? 0))}%`
}

/** "18 Aug 2026" — unambiguous, unlike numeric formats that flip by locale. */
export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function relativeDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const diffMs = Date.now() - d.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return shortDate(d)
}
