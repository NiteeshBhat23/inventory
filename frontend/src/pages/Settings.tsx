import { Desktop, Moon, SignOut, Sun } from '@phosphor-icons/react'
import { useState } from 'react'
import { api, ApiError } from '../lib/apiClient'
import { invalidate } from '../lib/useQuery'
import { useAuth } from '../lib/AuthContext'
import { useTheme, type ThemePref } from '../lib/ThemeContext'
import BackHeader from '../components/BackHeader'
import { Button } from '../components/ui/Button'
import { NumberField, TextField } from '../components/ui/Field'
import { Card, CardHeader } from '../components/ui/Card'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { cn } from '../lib/cn'

const THEMES: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'Auto', Icon: Desktop },
]

export default function Settings() {
  const { shop, refreshShop, signOut } = useAuth()
  const { pref, setPref } = useTheme()
  const toast = useToast()
  const confirm = useConfirm()

  const [name, setName] = useState(shop?.name ?? '')
  const [margin, setMargin] = useState(String(shop?.default_target_margin_pct ?? 20))
  const [threshold, setThreshold] = useState(String(shop?.default_low_stock_threshold ?? 5))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (!name.trim()) {
      setError('Shop name cannot be empty.')
      return
    }
    setSaving(true)
    try {
      await api.patch('/shops/me', {
        name: name.trim(),
        default_target_margin_pct: Number(margin),
        default_low_stock_threshold: Number(threshold),
      })
      // Margin and low-stock defaults feed every derived item field, so the
      // cached item lists and dashboard are stale the moment they change.
      invalidate('/dashboard', '/items')
      await refreshShop()
      toast.success('Settings saved')
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not save settings'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    const ok = await confirm({
      title: 'Sign out?',
      message: "You'll need your email and password to get back in.",
      confirmLabel: 'Sign out',
      destructive: true,
    })
    if (ok) await signOut()
  }

  return (
    <div className="space-y-4">
      <BackHeader title="Settings" fallback="/" />

      <Card>
        <CardHeader title="Shop profile" />
        <div className="space-y-3">
          <TextField
            label="Shop name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error && !name.trim() ? error : undefined}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label="Target margin"
              prefix="%"
              hint="Used to suggest selling prices"
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
            />
            <NumberField
              label="Low-stock alert"
              hint="Default for new items"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>
          <Button fullWidth loading={saving} onClick={save}>
            Save changes
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Appearance" subtitle="Auto follows your phone's setting" />
        {/* Radio group rather than a toggle: three states can't be expressed by
            a two-position switch, and "Auto" needs to be a visible choice. */}
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
          {THEMES.map(({ value, label, Icon }) => {
            const active = pref === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPref(value)}
                className={cn(
                  'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition-colors duration-150',
                  active
                    ? 'border-brand bg-brand-soft text-brand-soft-ink'
                    : 'border-line-strong bg-surface text-ink-muted hover:text-ink',
                )}
              >
                <Icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Account" subtitle={shop ? `Shop ID ${shop.id.slice(0, 8)}…` : undefined} />
        <Button
          variant="danger"
          fullWidth
          icon={<SignOut size={18} weight="bold" aria-hidden="true" />}
          onClick={handleSignOut}
        >
          Sign out
        </Button>
      </Card>
    </div>
  )
}
