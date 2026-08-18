import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { warmOnIntent } from '../lib/routeWarmup'
import { cn } from '../lib/cn'

type Tone = 'default' | 'good' | 'warn' | 'bad'

const toneRing: Record<Tone, string> = {
  default: 'border-line',
  good: 'border-line',
  warn: 'border-warn/35',
  bad: 'border-danger/35',
}

const toneIcon: Record<Tone, string> = {
  default: 'bg-surface-2 text-ink-muted',
  good: 'bg-good-soft text-good-soft-ink',
  warn: 'bg-warn-soft text-warn-soft-ink',
  bad: 'bg-danger-soft text-danger-soft-ink',
}

interface Props {
  label: string
  value: string
  icon?: ReactNode
  tone?: Tone
  /** Renders the tile as a link when the number is worth drilling into. */
  to?: string
  /** Hero tiles carry the two headline numbers; compact ones are supporting stats. */
  size?: 'hero' | 'compact'
}

export default function KpiTile({ label, value, icon, tone = 'default', to, size = 'compact' }: Props) {
  const hero = size === 'hero'

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'font-medium uppercase tracking-wide text-ink-muted',
            hero ? 'text-[11px]' : 'text-[10px]',
          )}
        >
          {label}
        </span>
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              'flex shrink-0 items-center justify-center rounded-lg',
              toneIcon[tone],
              hero ? 'h-8 w-8' : 'h-6 w-6',
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div
        className={cn(
          'nums mt-1.5 font-display font-semibold text-ink',
          hero ? 'text-2xl' : 'text-lg',
        )}
      >
        {value}
      </div>
    </>
  )

  const className = cn(
    'block rounded-2xl border bg-surface p-3.5 shadow-[var(--shadow-card)] transition-colors duration-150',
    toneRing[tone],
    to && 'hover:bg-surface-2 active:scale-[0.99]',
  )

  return to ? (
    <Link to={to} className={className} {...warmOnIntent(to)}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
