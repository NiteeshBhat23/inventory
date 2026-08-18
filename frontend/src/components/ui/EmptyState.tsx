import type { ReactNode } from 'react'

/** Empty states explain *why* a space is blank and offer the next step, rather
 *  than leaving a bare "No data yet" that reads like a bug to a shop owner
 *  opening the app for the first time. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={compact ? 'py-6 text-center' : 'py-12 text-center'}>
      <div
        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-subtle"
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="font-semibold text-ink">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-[38ch] text-sm text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
