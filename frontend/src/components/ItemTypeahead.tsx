import { MagnifyingGlass, PlusCircle } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../lib/apiClient'
import { moneyPrecise, qty } from '../lib/format'
import type { Item } from '../lib/types'
import { FieldShell, controlBase, controlTone } from './ui/Field'
import { cn } from '../lib/cn'

interface Props {
  label: string
  value: string
  onChangeText: (text: string) => void
  onSelectExisting: (item: Item) => void
  onCreateNew?: (name: string) => void
  placeholder?: string
  hint?: string
  error?: string
}

/** Item picker with search-as-you-type.
 *
 *  Implements the combobox keyboard contract (arrows to move, Enter to pick,
 *  Escape to close) because this is the single most-used control in the app —
 *  previously it was mouse-only, so a keyboard user could see suggestions but
 *  never select one. */
export default function ItemTypeahead({
  label,
  value,
  onChangeText,
  onSelectExisting,
  onCreateNew,
  placeholder,
  hint,
  error,
}: Props) {
  const id = useId()
  const listId = `${id}-list`
  const [results, setResults] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const query = value.trim()
  const canCreate = !!onCreateNew && query.length > 0
  // The "create new" row is a selectable option too, so it sits at the end of
  // the same index space the arrow keys walk.
  const optionCount = results.length + (canCreate ? 1 : 0)

  useEffect(() => {
    if (!query) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    if (timer.current) clearTimeout(timer.current)
    // Debounced so a fast typist doesn't fire a request per keystroke.
    timer.current = setTimeout(async () => {
      try {
        const items = await api.get<Item[]>(`/items?search=${encodeURIComponent(query)}`)
        setResults(items)
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

  function choose(index: number) {
    if (index < results.length) onSelectExisting(results[index])
    else if (canCreate) onCreateNew!(query)
    setOpen(false)
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
          placeholder={placeholder ?? 'Search…'}
          value={value}
          onChange={(e) => {
            onChangeText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          // Delayed so a click on an option lands before the list unmounts.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />

        {open && query.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching items"
            className="animate-fade-in absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-[var(--shadow-raised)]"
          >
            {loading && results.length === 0 && (
              <li className="px-3.5 py-3 text-sm text-ink-muted">Searching…</li>
            )}

            {results.map((item, i) => (
              <li key={item.item_id} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={() => choose(i)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex w-full min-h-12 items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors',
                    i === active ? 'bg-surface-2' : 'bg-transparent',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {item.canonical_name}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {item.category ?? 'Uncategorized'}
                    </span>
                  </span>
                  <span className="nums shrink-0 text-right text-xs text-ink-muted">
                    <span className="block">
                      {qty(item.stock_qty)} {item.unit}
                    </span>
                    <span className="block">{moneyPrecise(item.avg_cost)}</span>
                  </span>
                </button>
              </li>
            ))}

            {canCreate && (
              <li
                id={`${id}-opt-${results.length}`}
                role="option"
                aria-selected={active === results.length}
                className={results.length > 0 ? 'border-t border-line' : undefined}
              >
                <button
                  type="button"
                  onMouseDown={() => choose(results.length)}
                  onMouseEnter={() => setActive(results.length)}
                  className={cn(
                    'flex w-full min-h-12 items-center gap-2 px-3.5 py-2 text-left text-sm font-semibold text-brand-text transition-colors',
                    active === results.length ? 'bg-surface-2' : 'bg-transparent',
                  )}
                >
                  <PlusCircle size={18} weight="fill" aria-hidden="true" />
                  <span className="truncate">Create “{query}”</span>
                </button>
              </li>
            )}

            {!loading && results.length === 0 && !canCreate && (
              <li className="px-3.5 py-3 text-sm text-ink-muted">No matching items</li>
            )}
          </ul>
        )}
      </div>
    </FieldShell>
  )
}
