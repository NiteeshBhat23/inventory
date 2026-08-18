import { CaretRight, MagnifyingGlass, Package, Plus, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '../lib/useQuery'
import { warmOnIntent } from '../lib/routeWarmup'
import { moneyPrecise, qty } from '../lib/format'
import type { Item } from '../lib/types'
import BackHeader from '../components/BackHeader'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { ListSkeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/cn'

type SortKey = 'name' | 'stock' | 'cost'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'stock', label: 'Stock' },
  { key: 'cost', label: 'Cost' },
]

function Badge({ tone, children }: { tone: 'warn' | 'bad'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tone === 'bad'
          ? 'bg-danger-soft text-danger-soft-ink'
          : 'bg-warn-soft text-warn-soft-ink',
      )}
    >
      {children}
    </span>
  )
}

export default function Inventory() {
  // Seeded from the URL so a link from the dashboard's "Top items by profit"
  // or "Most sold" rows lands pre-filtered instead of on a blank list the
  // owner has to re-filter by hand.
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [sort, setSort] = useState<SortKey>('name')

  // The input updates on every keystroke, but the request only follows once
  // typing settles — this used to fire one API call per character.
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 220)
    return () => clearTimeout(t)
  }, [search])

  const { data, loading } = useQuery<Item[]>(
    `/items${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}`,
  )
  const items = useMemo(() => data ?? [], [data])

  const visible = useMemo(() => {
    return [...items].sort((a, b) => {
      if (sort === 'name') return a.canonical_name.localeCompare(b.canonical_name)
      if (sort === 'stock') return b.stock_qty - a.stock_qty
      return b.avg_cost - a.avg_cost
    })
  }, [items, sort])

  return (
    <div className="space-y-4">
      <BackHeader
        title="Stock"
        subtitle={items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : undefined}
        fallback="/"
      />

      <div className="relative">
        {/* Search is self-evident from the icon and placeholder, so the label is
            visually hidden rather than absent — screen readers still get it. */}
        <label htmlFor="inv-search" className="sr-only">
          Search items
        </label>
        <MagnifyingGlass
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          aria-hidden="true"
        />
        <input
          id="inv-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="min-h-12 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-10 text-ink transition-colors placeholder:text-ink-subtle hover:border-ink-subtle focus:border-brand"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-2"
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="ml-auto flex items-center gap-1.5">
          <label htmlFor="inv-sort" className="text-xs font-medium text-ink-muted">
            Sort
          </label>
          <select
            id="inv-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="min-h-11 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-semibold text-ink"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && items.length === 0 && <ListSkeleton rows={4} />}

      {!loading && visible.length === 0 && (
        <EmptyState
          icon={<Package size={24} weight="duotone" />}
          title={search ? 'No matching items' : 'No stock yet'}
          description={
            search
              ? `Nothing matches “${search}”. Try a different spelling, or add it as a new item on your next purchase.`
              : 'Items are created automatically when you log a purchase — no need to set up a catalogue first.'
          }
          action={
            !search ? (
              <ButtonLink to="/purchase/new" icon={<Plus size={18} weight="bold" aria-hidden="true" />}>
                Add a purchase
              </ButtonLink>
            ) : undefined
          }
        />
      )}

      {visible.length > 0 && (
        <ul className="space-y-2.5">
          {visible.map((item) => (
            <li key={item.item_id}>
              <Link
                to={`/items/${item.item_id}`}
                {...warmOnIntent(`/items/${item.item_id}`)}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-[var(--shadow-card)] transition-colors duration-150 hover:bg-surface-2 active:scale-[0.995]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-semibold text-ink">{item.canonical_name}</span>
                    {item.is_below_cost && <Badge tone="bad">Below cost</Badge>}
                    {item.is_low_stock && <Badge tone="warn">Low</Badge>}
                  </div>
                  <p className="nums mt-0.5 text-xs text-ink-muted">
                    {qty(item.stock_qty)} {item.unit} in stock
                  </p>
                </div>

                <div className="nums shrink-0 text-right">
                  <p className="text-sm font-semibold text-ink">{moneyPrecise(item.avg_cost)}</p>
                  <p
                    className={cn(
                      'text-xs',
                      item.is_below_cost ? 'font-semibold text-danger-text' : 'text-ink-muted',
                    )}
                  >
                    {item.is_below_cost ? 'selling below cost' : 'avg cost'}
                  </p>
                </div>

                <CaretRight size={16} weight="bold" className="shrink-0 text-ink-subtle" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
