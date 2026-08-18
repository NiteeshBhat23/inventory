import { useEffect, useRef, type ReactNode } from 'react'
import { useEscapeKey } from './Toast'

/** Bottom sheet.
 *
 *  Anchored to the bottom of the viewport because it's opened from the thumb
 *  zone (the FAB) — a centred modal would make the user reach back up to act
 *  on it. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEscapeKey(open, onClose)

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    // Move focus into the sheet so the next Tab lands on its actions rather
    // than continuing through the page behind it.
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus()

    // Stop the page behind from scrolling while the sheet owns the screen.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      restoreFocusRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'var(--scrim)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-md rounded-t-3xl border-t border-line bg-surface px-4 pt-2.5 shadow-[var(--shadow-overlay)]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
        <h2 className="mb-3 px-1 text-sm font-semibold text-ink-muted">{title}</h2>
        {children}
      </div>
    </div>
  )
}
