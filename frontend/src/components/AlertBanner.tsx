import { WarningCircle, Warning } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

interface Props {
  tone?: 'warn' | 'bad'
  children: ReactNode
}

/** Inline alert.
 *
 *  Pairs an icon with the colour so the severity is still legible to
 *  colour-blind users and in greyscale — colour alone can't carry meaning. */
export default function AlertBanner({ tone = 'warn', children }: Props) {
  const isBad = tone === 'bad'
  const cls = isBad
    ? 'bg-danger-soft border-danger/30 text-danger-soft-ink'
    : 'bg-warn-soft border-warn/30 text-warn-soft-ink'

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${cls}`}>
      <span className="mt-0.5 shrink-0">
        {isBad ? (
          <WarningCircle size={18} weight="fill" aria-hidden="true" />
        ) : (
          <Warning size={18} weight="fill" aria-hidden="true" />
        )}
      </span>
      <span className="flex-1 wrap-anywhere">{children}</span>
    </div>
  )
}
