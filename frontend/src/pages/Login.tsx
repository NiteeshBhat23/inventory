import { ArrowClockwise, Eye, EyeSlash, Storefront, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { api, ApiError } from '../lib/apiClient'
import { useAuth } from '../lib/AuthContext'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/Field'
import { useToast } from '../components/ui/Toast'
import Logo from '../components/Logo'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}

function Brand() {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      {/* Mark and wordmark sit on one line as a single lockup — stacking
          them separately read as three unrelated lines instead of one
          brand block. */}
      <div className="mb-3 flex items-center gap-2.5">
        <Logo size={34} />
        <span className="font-display text-2xl font-semibold tracking-tight text-ink">
          ProfitPulse
        </span>
      </div>
      {/* text-balance keeps the wrap even (no long line + a lonely orphan
          word), and the width cap keeps it from stretching to one line. */}
      <p className="max-w-[280px] text-balance text-sm leading-relaxed text-ink-muted">
        Know what every part really costs you — and what to charge.
      </p>
    </div>
  )
}

export default function Login() {
  const { session, shop, shopLoadError, refreshShop, signOut, authError, clearAuthError } = useAuth()
  const toast = useToast()

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [shopName, setShopName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  // A reset/magic link that bounced back with an error (expired, already
  // used, etc.) — land the user straight in the forgot-password screen with
  // an explanation instead of a bare, unexplained sign-in form.
  useEffect(() => {
    if (!authError) return
    setMode('forgot')
    setError(authError)
    clearAuthError()
  }, [authError, clearAuthError])

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error: e1 } = await supabase.auth.signUp({ email, password })
        if (e1) throw e1
        toast.success('Account created')
      } else {
        const { error: e2 } = await supabase.auth.signInWithPassword({ email, password })
        if (e2) throw e2
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      // The link this sends back to `${origin}/reset-password` — that path
      // must be listed under Supabase's Authentication -> URL Configuration
      // -> Redirect URLs, or the request succeeds here but the email link
      // bounces to Supabase's default site URL instead.
      const { error: e1 } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (e1) throw e1
      setResetSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateShop(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.post('/shops', {
        name: shopName.trim(),
        default_target_margin_pct: 20,
        default_low_stock_threshold: 5,
      })
      await refreshShop()
      toast.success(`Welcome, ${shopName.trim()}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create shop profile')
    } finally {
      setBusy(false)
    }
  }

  // Signed in, but the shop lookup itself failed (server unreachable) — distinct
  // from "no shop yet". Showing the create-shop form here would loop the user
  // into an "already exists" error with no way out.
  if (session && shopLoadError) {
    return (
      <Shell>
        <div className="rounded-2xl border border-danger/30 bg-surface p-6 text-center shadow-[var(--shadow-card)]">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger-soft-ink">
            <WarningCircle size={24} weight="fill" aria-hidden="true" />
          </span>
          <h1 className="font-display text-lg font-semibold text-ink">Can't reach your shop</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{shopLoadError}</p>
          <p className="mt-3 text-xs text-ink-subtle">
            This usually means the server isn't running. Start it, then retry.
          </p>
          <div className="mt-5 space-y-2">
            <Button
              fullWidth
              icon={<ArrowClockwise size={18} weight="bold" aria-hidden="true" />}
              onClick={() => refreshShop()}
            >
              Retry
            </Button>
            <Button variant="ghost" fullWidth onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </Shell>
    )
  }

  if (session && !shop) {
    return (
      <Shell>
        <form
          onSubmit={handleCreateShop}
          className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
        >
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-ink">
            <Storefront size={24} weight="duotone" aria-hidden="true" />
          </span>
          <h1 className="text-center font-display text-lg font-semibold text-ink">Name your shop</h1>
          <p className="mt-1 text-center text-sm text-ink-muted">
            One quick step and you're ready to start tracking.
          </p>

          <div className="mt-5 space-y-4">
            <TextField
              label="Shop name"
              required
              autoFocus
              autoComplete="organization"
              placeholder="e.g. Sharma Auto Service"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              error={error ?? undefined}
            />
            <Button type="submit" fullWidth loading={busy}>
              Create shop
            </Button>
            <Button type="button" variant="ghost" fullWidth onClick={signOut}>
              Sign out
            </Button>
          </div>
        </form>
      </Shell>
    )
  }

  if (mode === 'forgot') {
    return (
      <Shell>
        <Brand />
        <form
          onSubmit={handleForgotPassword}
          className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
        >
          <h1 className="text-center font-display text-lg font-semibold text-ink">Reset your password</h1>

          {resetSent ? (
            <p className="text-center text-sm text-ink-muted">
              If an account exists for <span className="font-medium text-ink">{email}</span>, we've
              sent a link to reset your password. Check your inbox.
            </p>
          ) : (
            <>
              <p className="text-center text-sm text-ink-muted">
                Enter your email and we'll send you a link to reset your password.
              </p>
              <TextField
                label="Email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              {error && (
                <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger-text">
                  <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}

              <Button type="submit" fullWidth size="lg" loading={busy}>
                Send reset link
              </Button>
            </>
          )}

          <button
            type="button"
            className="min-h-11 w-full text-center text-sm text-ink-muted transition-colors hover:text-ink"
            onClick={() => {
              setMode('signin')
              setError(null)
              setResetSent(false)
            }}
          >
            <span className="font-semibold text-brand-text">Back to log in</span>
          </button>
        </form>
      </Shell>
    )
  }

  return (
    <Shell>
      <Brand />
      <form
        onSubmit={handleAuth}
        className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
      >
        <TextField
          label="Email"
          type="email"
          required
          // autoComplete lets the password manager fill both fields, which WCAG
          // 2.2 asks for rather than forcing the user to recall credentials.
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div className="relative">
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={6}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {/* Sits over the input's own row, below the label. */}
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-1.5 top-7 flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {showPassword ? (
              <EyeSlash size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        </div>

        {mode === 'signin' && (
          <button
            type="button"
            className="-mt-2 block text-sm font-medium text-brand-text hover:underline"
            onClick={() => {
              setMode('forgot')
              setError(null)
              setResetSent(false)
            }}
          >
            Forgot password?
          </button>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger-text">
            <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <Button type="submit" fullWidth size="lg" loading={busy}>
          {mode === 'signin' ? 'Log in' : 'Create account'}
        </Button>

        <button
          type="button"
          className="min-h-11 w-full text-center text-sm text-ink-muted transition-colors hover:text-ink"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
          }}
        >
          {mode === 'signin' ? (
            <>
              New here? <span className="font-semibold text-brand-text">Create an account</span>
            </>
          ) : (
            <>
              Already have an account? <span className="font-semibold text-brand-text">Log in</span>
            </>
          )}
        </button>
      </form>
    </Shell>
  )
}
