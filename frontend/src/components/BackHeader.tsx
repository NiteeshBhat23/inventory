import { CaretLeft } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

interface Props {
  title: string
  /** Where to land when this page was opened directly (deep link, refresh,
   *  PWA cold start) and there's no history entry to pop. */
  fallback?: string
  subtitle?: string
  action?: ReactNode
}

export default function BackHeader({ title, fallback = '/', subtitle, action }: Props) {
  const navigate = useNavigate()

  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate(fallback)
  }

  // The button and the title sit in matching fixed-height boxes so both
  // center on the same line by construction — no magic-number nudging
  // (mt-0.5, pt-1, …) trying to eyeball two different font metrics into
  // alignment. The subtitle lives outside that row, so it doesn't skew it.
  return (
    <div className="mb-4 flex items-start gap-1.5">
      <button
        type="button"
        onClick={goBack}
        aria-label="Go back"
        className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-95"
      >
        <CaretLeft size={22} weight="bold" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="flex h-11 items-center truncate font-display text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="-mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex h-11 shrink-0 items-center">{action}</div>}
    </div>
  )
}
