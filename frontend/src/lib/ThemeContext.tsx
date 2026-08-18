import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
type Resolved = 'light' | 'dark'

interface ThemeState {
  /** What the user chose — including "system". */
  pref: ThemePref
  /** What's actually on screen right now. */
  resolved: Resolved
  setPref: (p: ThemePref) => void
}

const ThemeCtx = createContext<ThemeState | undefined>(undefined)

function systemTheme(): Resolved {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredPref(): ThemePref {
  try {
    const v = localStorage.getItem('theme')
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readStoredPref)
  const [resolved, setResolved] = useState<Resolved>(() =>
    pref === 'system' ? systemTheme() : pref,
  )

  // A single place decides the real theme and writes it to <html>. Components
  // then only read tokens, so nothing else in the app branches on theme.
  useEffect(() => {
    const next = pref === 'system' ? systemTheme() : pref
    setResolved(next)
    document.documentElement.setAttribute('data-theme', next)
  }, [pref])

  // Only follow the OS while the user hasn't picked an explicit theme.
  useEffect(() => {
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const next = systemTheme()
      setResolved(next)
      document.documentElement.setAttribute('data-theme', next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p)
    try {
      if (p === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', p)
    } catch {
      /* private mode — theme just won't persist across reloads */
    }
  }, [])

  return <ThemeCtx.Provider value={{ pref, resolved, setPref }}>{children}</ThemeCtx.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
