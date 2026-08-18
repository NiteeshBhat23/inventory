import {
  ChartBar,
  GearSix,
  House,
  Minus,
  Moon,
  Package,
  Plus,
  Receipt,
  Sun,
  Tag,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'
import { IconButton } from './ui/Button'
import { Sheet } from './ui/Sheet'

/** Bottom nav holds destinations only.
 *
 *  "Add Purchase" and "Record Sale" used to live here, which conflated *places*
 *  with *actions* — tapping them navigated away with no way to tell you'd
 *  started something. They're now behind the centre FAB, which also puts the
 *  two most-used actions directly under the thumb. Settings was previously
 *  stranded in the header with no nav entry at all. */
const navItems = [
  { to: '/', label: 'Home', Icon: House, end: true },
  { to: '/inventory', label: 'Stock', Icon: Package, end: false },
  { to: '/reports', label: 'Reports', Icon: ChartBar, end: false },
  { to: '/settings', label: 'Settings', Icon: GearSix, end: false },
]

function NavItem({
  to,
  label,
  Icon,
  end,
}: {
  to: string
  label: string
  Icon: typeof House
  end: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors duration-150 ${
          isActive ? 'text-brand-text' : 'text-ink-muted hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* Weight change + colour + top bar: three cues, so the active tab is
              not signalled by colour alone. */}
          <Icon size={23} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />
          <span>{label}</span>
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand"
            />
          )}
        </>
      )}
    </NavLink>
  )
}

export default function Layout() {
  const { shop } = useAuth()
  const { resolved, setPref } = useTheme()
  const navigate = useNavigate()
  const [actionsOpen, setActionsOpen] = useState(false)

  function go(path: string) {
    setActionsOpen(false)
    navigate(path)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header
        className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-3">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 rounded-lg py-1 pr-2 text-ink transition-opacity hover:opacity-80"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-ink">
              <Tag size={17} weight="fill" aria-hidden="true" />
            </span>
            <span className="truncate font-display text-[0.9375rem] font-semibold">
              {shop?.name ?? 'ProfitPulse'}
            </span>
          </Link>

          <IconButton
            label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setPref(resolved === 'dark' ? 'light' : 'dark')}
            icon={
              resolved === 'dark' ? (
                <Sun size={20} weight="fill" aria-hidden="true" />
              ) : (
                <Moon size={20} weight="fill" aria-hidden="true" />
              )
            }
          />
        </div>
      </header>

      {/* Bottom padding clears the fixed nav + FAB so the last row of content is
          never trapped underneath it. */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 pb-32 pt-4">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md safe-bottom"
      >
        <div className="mx-auto flex w-full max-w-md items-stretch">
          <NavItem {...navItems[0]} />
          <NavItem {...navItems[1]} />

          <div className="relative flex w-16 shrink-0 justify-center">
            <button
              type="button"
              onClick={() => setActionsOpen(true)}
              aria-label="New entry"
              aria-haspopup="dialog"
              aria-expanded={actionsOpen}
              className="absolute -top-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-[var(--shadow-raised)] transition-transform duration-150 active:scale-95"
            >
              {/* The icon rotating into a minus signals the same button closes
                  the sheet, instead of looking like a second unrelated control. */}
              <span
                className="transition-transform duration-200"
                style={{ transform: actionsOpen ? 'rotate(90deg)' : 'none' }}
              >
                {actionsOpen ? (
                  <Minus size={26} weight="bold" aria-hidden="true" />
                ) : (
                  <Plus size={26} weight="bold" aria-hidden="true" />
                )}
              </span>
            </button>
          </div>

          <NavItem {...navItems[2]} />
          <NavItem {...navItems[3]} />
        </div>
      </nav>

      <Sheet open={actionsOpen} onClose={() => setActionsOpen(false)} title="What do you want to record?">
        <div className="space-y-2">
          <ActionRow
            icon={<Receipt size={22} weight="duotone" aria-hidden="true" />}
            title="Add Purchase"
            description="Stock you bought from a supplier"
            onClick={() => go('/purchase/new')}
          />
          <ActionRow
            icon={<Tag size={22} weight="duotone" aria-hidden="true" />}
            title="Record Sale"
            description="Parts used or sold to a customer"
            onClick={() => go('/sale/new')}
          />
        </div>
      </Sheet>
    </div>
  )
}

function ActionRow({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left transition-colors duration-150 hover:bg-surface-2 active:scale-[0.99]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-ink">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block text-xs text-ink-muted">{description}</span>
      </span>
    </button>
  )
}
