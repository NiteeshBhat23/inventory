import {
  ArrowUp,
  CaretRight,
  CurrencyInr,
  HandCoins,
  Package,
  Receipt,
  Sparkle,
  TrendUp,
  Warning,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '../lib/useQuery'
import { money, qty, relativeDate } from '../lib/format'
import { PERIODS } from '../lib/periods'
import type { DashboardData } from '../lib/types'
import KpiTile from '../components/KpiTile'
import { Card, CardHeader, CardList, CardListRow } from '../components/ui/Card'
import { RankedList } from '../components/ui/RankedList'
import { EmptyState } from '../components/ui/EmptyState'
import { DashboardSkeleton } from '../components/ui/Skeleton'
import { ButtonLink } from '../components/ui/Button'
import { controlBase, controlTone } from '../components/ui/Field'
import { cn } from '../lib/cn'

export default function Dashboard() {
  const [days, setDays] = useState(30)
  const { data, loading } = useQuery<DashboardData>(`/dashboard?days=${days}`)

  const hasActivity = !!data && data.recent_activity.length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>

        {/* A dropdown rather than the old 3-button segmented control: once
            "beyond 90 days" needed supporting, a fixed row of buttons stopped
            scaling. Same option list as every other Period picker in the app. */}
        <label className="relative">
          <span className="sr-only">Date range</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className={cn(controlBase, controlTone(), 'min-h-11 w-auto appearance-none py-0 pr-8 text-sm font-semibold')}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2364748b' stroke-width='1.75'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.6rem center',
              backgroundSize: '0.875rem',
            }}
          >
            {PERIODS.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && !data && <DashboardSkeleton />}

      {data && (
        <div className={cn('space-y-4', loading && 'opacity-60 transition-opacity')}>
          <div className="grid grid-cols-2 gap-2.5">
            <KpiTile
              size="hero"
              label="Stock value"
              value={money(data.kpis.inventory_value)}
              icon={<Package size={17} weight="duotone" />}
              to="/inventory"
            />
            <KpiTile
              size="hero"
              label="Profit"
              value={money(data.kpis.profit)}
              tone="good"
              icon={<TrendUp size={17} weight="duotone" />}
              to="/insights/profit"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <KpiTile
              label="Revenue"
              value={money(data.kpis.revenue)}
              icon={<CurrencyInr size={13} weight="bold" />}
              to="/insights/revenue"
            />
            <KpiTile
              label="Low stock"
              value={String(data.kpis.low_stock_count)}
              tone={data.kpis.low_stock_count ? 'warn' : 'default'}
              icon={<Warning size={13} weight="duotone" />}
              to="/inventory"
            />
          </div>

          {!hasActivity ? (
            <Card>
              <EmptyState
                icon={<Sparkle size={24} weight="duotone" />}
                title="Nothing recorded yet"
                description="Log your first purchase and this dashboard will start tracking your costs, margins and stock levels."
                action={
                  <ButtonLink to="/purchase/new" icon={<Receipt size={18} weight="fill" />}>
                    Add your first purchase
                  </ButtonLink>
                }
              />
            </Card>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <RankedList
                  title="Top items by profit"
                  data={data.top_items_by_profit}
                  format={money}
                  emptyLabel="No sales in this period."
                  linkFor={(d) => `/inventory?q=${encodeURIComponent(d.name)}`}
                />
                <RankedList
                  title="Most sold"
                  data={data.top_items_by_volume}
                  format={qty}
                  emptyLabel="No sales in this period."
                  linkFor={(d) => `/inventory?q=${encodeURIComponent(d.name)}`}
                />
              </div>

              <RankedList
                title="Spend by supplier"
                data={data.supplier_spend}
                format={money}
                emptyLabel="No purchases in this period."
                linkFor={(d) => `/purchases/history?supplier=${encodeURIComponent(d.name)}`}
              />

              <Card>
                <CardHeader
                  title="Recent activity"
                  action={
                    <Link
                      to="/reports"
                      className="flex items-center gap-0.5 text-xs font-semibold text-brand-text"
                    >
                      Insights
                      <CaretRight size={13} weight="bold" aria-hidden="true" />
                    </Link>
                  }
                />
                <CardList>
                  {data.recent_activity.map((a, i) => {
                    const isSale = a.type === 'sale'
                    return (
                      <CardListRow key={i}>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                              isSale
                                ? 'bg-good-soft text-good-soft-ink'
                                : 'bg-surface-2 text-ink-muted',
                            )}
                          >
                            {isSale ? (
                              <HandCoins size={15} weight="duotone" />
                            ) : (
                              <ArrowUp size={15} weight="bold" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">
                              {a.item_name}
                            </span>
                            <span className="block text-xs text-ink-muted">
                              {isSale ? 'Sold' : 'Bought'} {qty(a.quantity)} ·{' '}
                              {relativeDate(a.date)}
                            </span>
                          </span>
                        </span>
                        <span className="nums shrink-0 text-sm font-semibold text-ink">
                          {money(a.amount)}
                        </span>
                      </CardListRow>
                    )
                  })}
                </CardList>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  )
}
