import { CircleNotch } from '@phosphor-icons/react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-transparent text-danger-text border border-danger/40 hover:bg-danger-soft',
}

// Every size clears the 44px minimum touch target from Apple HIG / WCAG 2.2,
// including `sm` — the old build had 16px-tall text links as primary actions.
const sizes: Record<Size, string> = {
  sm: 'min-h-11 px-3 text-sm gap-1.5',
  md: 'min-h-12 px-4 text-[0.9375rem] gap-2',
  lg: 'min-h-14 px-5 text-base gap-2',
}

const base =
  'inline-flex items-center justify-center rounded-xl font-semibold transition-[filter,background-color,color,transform] duration-150 ' +
  'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none'

interface CommonProps {
  variant?: Variant
  size?: Size
  loading?: boolean
  fullWidth?: boolean
  icon?: ReactNode
  children?: ReactNode
  className?: string
}

export interface ButtonProps
  extends CommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, icon, children, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // aria-busy tells screen readers the control is working; disabling during
      // async work is what stops double-submits on a slow shop wifi connection.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? (
        <CircleNotch size={18} weight="bold" className="animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
})

/** Same visual language as Button, but renders a router link — so navigation
 *  stays a real anchor (middle-click, open-in-new-tab, screen-reader "link"). */
export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  fullWidth,
  icon,
  children,
  className,
}: CommonProps & { to: string }) {
  return (
    <Link
      to={to}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
    >
      {icon}
      {children}
    </Link>
  )
}

/** Icon-only control. `label` is required because an icon button with no text
 *  is invisible to screen readers — this makes the accessible name impossible
 *  to forget rather than merely recommended. */
export function IconButton({
  label,
  icon,
  onClick,
  className,
  variant = 'ghost',
}: {
  label: string
  icon: ReactNode
  onClick?: () => void
  className?: string
  variant?: Variant
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-150 active:scale-[0.96]',
        variants[variant],
        className,
      )}
    >
      {icon}
    </button>
  )
}
