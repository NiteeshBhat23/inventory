import { WarningCircle } from '@phosphor-icons/react'
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const controlBase =
  'w-full min-h-12 rounded-xl border bg-surface px-3 text-ink transition-colors duration-150 ' +
  'placeholder:text-ink-subtle disabled:opacity-50 disabled:bg-surface-2'

function controlTone(invalid?: boolean) {
  return invalid
    ? 'border-danger focus:border-danger'
    : 'border-line-strong hover:border-ink-subtle focus:border-brand'
}

interface FieldShellProps {
  id: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}

/** Wraps any control with the label / hint / error scaffolding.
 *
 *  The whole reason this exists as a component rather than a convention: the
 *  previous build used placeholders as labels everywhere, which disappear the
 *  moment the user types and are never announced by screen readers. Making the
 *  label a required prop means a field literally cannot be built without one. */
export function FieldShell({ id, label, hint, error, required, children, className }: FieldShellProps) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-danger-text" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        // role="alert" so the message is announced when it appears, and it sits
        // beside the field rather than in a banner at the top of the form.
        <p id={errorId} role="alert" className="flex items-center gap-1 text-xs font-medium text-danger-text">
          <WarningCircle size={14} weight="fill" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  label: string
  hint?: string
  error?: string
  /** Rendered inside the control, e.g. a ₹ symbol. */
  prefix?: string
  className?: string
}

export function TextField({ label, hint, error, prefix, className, required, ...rest }: TextFieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <div className="relative">
        {prefix && (
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted"
            aria-hidden="true"
          >
            {prefix}
          </span>
        )}
        <input
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(controlBase, controlTone(!!error), prefix && 'pl-7')}
          {...rest}
        />
      </div>
    </FieldShell>
  )
}

/** Money/quantity input.
 *
 *  Uses text + inputMode="decimal" rather than type="number" deliberately:
 *  number inputs silently mutate on scroll-wheel, reject intermediate states
 *  like "1." while typing, and render a spinner nobody wants on a phone.
 *  inputMode still summons the numeric keypad on mobile. */
export function NumberField(props: Omit<TextFieldProps, 'type' | 'inputMode'>) {
  return <TextField type="text" inputMode="decimal" autoComplete="off" {...props} />
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> {
  label: string
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}

export function SelectField({ label, hint, error, className, children, required, ...rest }: SelectFieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(controlBase, controlTone(!!error), 'appearance-none pr-9')}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2364748b' stroke-width='1.75'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.75rem center',
          backgroundSize: '1rem',
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  )
}

export { controlBase, controlTone }
