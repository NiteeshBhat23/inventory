import { CaretRight } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
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
  linkFor,
}: {
  title: string
  subtitle?: string
  data: NamedValue[]
  format: (n: number) => string
  emptyLabel: string
  limit?: number
  /** When given, each row becomes a link to the full breakdown behind that
   *  number — the bar and the total are only ever a preview. */
  linkFor?: (d: NamedValue) => string
}) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1)

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {data.length === 0 ? (
        <p className="py-3 text-sm text-ink-muted">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2.5">
          {data.slice(0, limit).map((d) => {
            const bar = (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-ink">{d.name}</span>
                  <span className="nums shrink-0 flex items-center gap-1 text-sm font-semibold text-ink">
                    {format(d.value)}
                    {linkFor && (
                      <CaretRight
                        size={13}
                        weight="bold"
                        className="text-ink-subtle"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-brand transition-[width] duration-500"
                    style={{ width: `${Math.max((Math.abs(d.value) / max) * 100, 3)}%` }}
                    aria-hidden="true"
                  />
                </div>
              </>
            )
            return (
              <li key={d.name}>
                {linkFor ? (
                  <Link
                    to={linkFor(d)}
                    className="-m-1 block rounded-lg p-1 transition-colors hover:bg-surface-2 active:scale-[0.99]"
                  >
                    {bar}
                  </Link>
                ) : (
                  bar
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
