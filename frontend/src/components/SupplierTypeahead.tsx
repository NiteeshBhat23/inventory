import { ClockCounterClockwise, MagnifyingGlass, PlusCircle } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../lib/apiClient'
import { getRecents, pushRecent } from '../lib/recents'
import { FieldShell, controlBase, controlTone } from './ui/Field'
import { cn } from '../lib/cn'

interface Props {
  label: string
  value: string
  onChange: (name: string) => void
  placeholder?: string
  hint?: string
  error?: string
}

const RECENT_LIMIT = 3

/** Supplier name picker — search-as-you-type over suppliers you've actually
 *  bought from before, plus your last few before you've typed anything, with
 *  "Use <name>" always available since a supplier isn't a record with an id,
 *  just a name on a purchase. Same combobox contract as ItemTypeahead
 *  (arrows, Enter, Escape) and the same "never dump the whole list" rule. */
export default function SupplierTypeahead({ label, value, onChange, placeholder, hint, error }: Props) {
  const id = useId()
  const listId = `${id}-list`
  const [results, setResults] = useState<string[]>([])
  const [recents, setRecents] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const query = value.trim()
  const showingRecents = query.length === 0
  const options = showingRecents ? recents : results
  // "Use <what's typed>" is always offered once there's text — a supplier is
  // just a name, so there's no separate create step the way items have one.
  const exactMatch = options.some((o) => o.toLowerCase() === query.toLowerCase())
  const canUseTyped = query.length > 0 && !exactMatch
  const optionCount = options.length + (canUseTyped ? 1 : 0)

  useEffect(() => {
    if (!open || !showingRecents) return
    setRecents(getRecents('suppliers').slice(0, RECENT_LIMIT))
    setActive(0)
  }, [open, showingRecents])

  useEffect(() => {
    if (!query) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const names = await api.get<string[]>(`/purchases/suppliers?search=${encodeURIComponent(query)}`)
        setResults(names)
        setActive(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query])

  function pick(name: string) {
    pushRecent('suppliers', name)
    onChange(name)
    setOpen(false)
  }

  function choose(index: number) {
    if (index < options.length) pick(options[index])
    else if (canUseTyped) pick(query)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || optionCount === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % optionCount)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + optionCount) % optionCount)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && (query.length > 0 || options.length > 0)

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <MagnifyingGlass
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          aria-hidden="true"
        />
        <input
          id={id}
          role="combobox"
          aria-expanded={open && optionCount > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && optionCount > 0 ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className={cn(controlBase, controlTone(!!error), 'pl-9')}
          placeholder={placeholder ?? 'Search or add a supplier'}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />

        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label={showingRecents ? 'Recently used suppliers' : 'Matching suppliers'}
            className="animate-fade-in absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-[var(--shadow-raised)]"
          >
            {showingRecents && options.length > 0 && (
              <li className="flex items-center gap-1.5 px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                <ClockCounterClockwise size={13} aria-hidden="true" />
                Recently used
              </li>
            )}

            {loading && !showingRecents && results.length === 0 && (
              <li className="px-3.5 py-3 text-sm text-ink-muted">Searching…</li>
            )}

            {options.map((name, i) => (
              <li key={name} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={() => choose(i)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex w-full min-h-12 items-center px-3.5 py-2 text-left text-sm font-medium text-ink transition-colors',
                    i === active ? 'bg-surface-2' : 'bg-transparent',
                  )}
                >
                  <span className="truncate">{name}</span>
                </button>
              </li>
            ))}

            {canUseTyped && (
              <li
                id={`${id}-opt-${options.length}`}
                role="option"
                aria-selected={active === options.length}
                className={options.length > 0 ? 'border-t border-line' : undefined}
              >
                <button
                  type="button"
                  onMouseDown={() => choose(options.length)}
                  onMouseEnter={() => setActive(options.length)}
                  className={cn(
                    'flex w-full min-h-12 items-center gap-2 px-3.5 py-2 text-left text-sm font-semibold text-brand-text transition-colors',
                    active === options.length ? 'bg-surface-2' : 'bg-transparent',
                  )}
                >
                  <PlusCircle size={18} weight="fill" aria-hidden="true" />
                  <span className="truncate">Use "{query}"</span>
                </button>
              </li>
            )}

            {!loading && !showingRecents && results.length === 0 && !canUseTyped && (
              <li className="px-3.5 py-3 text-sm text-ink-muted">No matching suppliers</li>
            )}
          </ul>
        )}
      </div>
    </FieldShell>
  )
}
