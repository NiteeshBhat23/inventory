import type { NamedValue } from '../../lib/types'
import { Card, CardHeader } from './Card'

/** Ranked list with a proportional bar.
 *
 *  A lightweight stand-in for a bar chart: it shows relative magnitude at a
 *  glance without pulling in a charting library, and because the number is
 *  always printed alongside, the bar is never the only way to read the value. */
export function RankedList({
  title,
  subtitle,
  data,
  format,
  emptyLabel,
  limit = 5,
}: {
  title: string
  subtitle?: string
  data: NamedValue[]
  format: (n: number) => string
  emptyLabel: string
  limit?: number
}) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1)

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {data.length === 0 ? (
        <p className="py-3 text-sm text-ink-muted">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2.5">
          {data.slice(0, limit).map((d) => (
            <li key={d.name}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-ink">{d.name}</span>
                <span className="nums shrink-0 text-sm font-semibold text-ink">{format(d.value)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-500"
                  style={{ width: `${Math.max((Math.abs(d.value) / max) * 100, 3)}%` }}
                  aria-hidden="true"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
