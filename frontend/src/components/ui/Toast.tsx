import { CheckCircle, Info, WarningCircle, X } from '@phosphor-icons/react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastCtx = createContext<ToastApi | undefined>(undefined)

const tones: Record<ToastTone, { cls: string; icon: ReactNode }> = {
  success: {
    cls: 'bg-brand-soft text-brand-soft-ink border-brand/30',
    icon: <CheckCircle size={20} weight="fill" aria-hidden="true" />,
  },
  error: {
    cls: 'bg-danger-soft text-danger-soft-ink border-danger/30',
    icon: <WarningCircle size={20} weight="fill" aria-hidden="true" />,
  },
  info: {
    cls: 'bg-surface text-ink border-line-strong',
    icon: <Info size={20} weight="fill" aria-hidden="true" />,
  },
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((message: string, tone: ToastTone) => {
    const id = nextId++
    setItems((prev) => [...prev, { id, message, tone }])
    // 4s is long enough to read a short confirmation without lingering over
    // the content the user is trying to get back to.
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  const api: ToastApi = {
    success: useCallback((m: string) => push(m, 'success'), [push]),
    error: useCallback((m: string) => push(m, 'error'), [push]),
    info: useCallback((m: string) => push(m, 'info'), [push]),
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {/* polite + never focused: a confirmation shouldn't yank the user out of
          whatever they're doing, it just needs to be announced and readable. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)' }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`animate-slide-up pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium shadow-[var(--shadow-raised)] ${tones[t.tone].cls}`}
          >
            {tones[t.tone].icon}
            <span className="flex-1 wrap-anywhere">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-70 transition-opacity hover:opacity-100"
            >
              <X size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

/** Closes an overlay when Escape is pressed. Shared by Sheet and ConfirmDialog
 *  so every dismissible surface honours the same escape route. */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [active, onEscape])
}
