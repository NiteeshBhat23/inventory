import { Eye, EyeSlash, LockKey, WarningCircle } from '@phosphor-icons/react'
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/Field'
import { useToast } from '../components/ui/Toast'
import Logo from '../components/Logo'

/** Shown instead of the normal app shell whenever AuthContext's
 *  `passwordRecovery` flag is set — i.e. the user arrived via the "reset
 *  your password" email link. They must set a new password here before
 *  the recovery session is allowed to reach the rest of the app. */
export default function ResetPassword() {
  const { clearPasswordRecovery, signOut } = useAuth()
  const toast = useToast()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      toast.success('Password updated')
      // The recovery session is now a normal one — let the Gate route the
      // user into the app rather than showing this screen again.
      clearPasswordRecovery()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex items-center gap-2.5">
            <Logo size={34} />
            <span className="font-display text-2xl font-semibold tracking-tight text-ink">
              ProfitPulse
            </span>
          </div>
          <p className="max-w-[280px] text-balance text-sm leading-relaxed text-ink-muted">
            Choose a new password for your account.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
        >
          <span className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-ink">
            <LockKey size={24} weight="duotone" aria-hidden="true" />
          </span>
          <h1 className="text-center font-display text-lg font-semibold text-ink">
            Set a new password
          </h1>

          <div className="relative">
            <TextField
              label="New password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="new-password"
              autoFocus
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
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

          <TextField
            label="Confirm password"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Re-enter your new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger-text">
              <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <Button type="submit" fullWidth size="lg" loading={busy}>
            Update password
          </Button>

          <button
            type="button"
            className="min-h-11 w-full text-center text-sm text-ink-muted transition-colors hover:text-ink"
            onClick={() => {
              clearPasswordRecovery()
              signOut()
            }}
          >
            Cancel and sign out
          </button>
        </form>
      </div>
    </div>
  )
}
