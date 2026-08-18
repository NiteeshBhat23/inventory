import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { useEscapeKey } from './Toast'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type Resolver = (ok: boolean) => void

const ConfirmCtx = createContext<((o: ConfirmOptions) => Promise<boolean>) | undefined>(undefined)

/** Promise-based confirmation, so call sites read almost exactly like the
 *  native `confirm()` they replace:
 *
 *      if (!(await confirm({ title: 'Archive item?' }))) return
 *
 *  The native dialog couldn't be styled, ignored the app's theme, and on mobile
 *  looked like a browser security prompt rather than part of the product. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<Resolver | null>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const confirm = useCallback((o: ConfirmOptions) => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const close = useCallback((result: boolean) => {
    resolverRef.current?.(result)
    resolverRef.current = null
    setOpts(null)
    // Send focus back where it came from, so keyboard users aren't dumped at
    // the top of the document after dismissing.
    restoreFocusRef.current?.focus?.()
  }, [])

  useEscapeKey(!!opts, () => close(false))

  useEffect(() => {
    if (opts) confirmBtnRef.current?.focus()
  }, [opts])

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{ background: 'var(--scrim)' }}
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={opts.message ? 'confirm-message' : undefined}
            onClick={(e) => e.stopPropagation()}
            className="animate-pop-in w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-raised)]"
          >
            <h2 id="confirm-title" className="text-base font-semibold text-ink">
              {opts.title}
            </h2>
            {opts.message && (
              <p id="confirm-message" className="mt-1.5 text-sm text-ink-muted">
                {opts.message}
              </p>
            )}
            <div className="mt-5 flex gap-2.5">
              <Button variant="secondary" fullWidth onClick={() => close(false)}>
                {opts.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                ref={confirmBtnRef}
                variant={opts.destructive ? 'danger' : 'primary'}
                fullWidth
                onClick={() => close(true)}
              >
                {opts.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
