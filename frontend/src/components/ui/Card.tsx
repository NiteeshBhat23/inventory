import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Surfaces use one shared elevation so the page reads as a consistent stack
 *  rather than a pile of arbitrary shadows. */
export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/** Divided vertical list used for activity feeds, rankings and history rows. */
export function CardList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line">{children}</ul>
}

export function CardListRow({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn('flex items-center justify-between gap-3 py-2.5', className)}>{children}</li>
}
