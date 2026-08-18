import {
  ArrowUp,
  CaretRight,
  CurrencyInr,
  Package,
  Receipt,
  Sparkle,
  Tag,
  TrendUp,
  Warning,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { money, qty, relativeDate } from '../lib/format'
import type { DashboardData } from '../lib/types'
import KpiTile from '../components/KpiTile'
import AlertBanner from '../components/AlertBanner'
import { Card, CardHeader, CardList, CardListRow } from '../components/ui/Card'
import { RankedList } from '../components/ui/RankedList'
import { EmptyState } from '../components/ui/EmptyState'
import { DashboardSkeleton } from '../components/ui/Skeleton'
import { ButtonLink } from '../components/ui/Button'
import { cn } from '../lib/cn'

const RANGES = [
  { label: '7 days', short: '7d', days: 7 },
  { label: '30 days', short: '30d', days: 30 },
  { label: '90 days', short: '90d', days: 90 },
]

export default function Dashboard() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get<DashboardData>(`/dashboard?days=${days}`)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])

  const hasActivity = !!data && data.recent_activity.length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>

        {/* Segmented control: one visible group, one pressed state, all three
            options always reachable — clearer than a dropdown for 3 choices. */}
        <div
          role="group"
          aria-label="Date range"
          className="flex rounded-xl border border-line bg-surface p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              aria-label={`Last ${r.label}`}
              className={cn(
                'min-h-11 min-w-11 rounded-lg px-3 text-xs font-semibold transition-colors duration-150',
                days === r.days ? 'bg-brand text-brand-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {r.short}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && <DashboardSkeleton />}

      {data && (
        <div className={cn('space-y-4', loading && 'opacity-60 transition-opacity')}>
          <div className="grid grid-cols-2 gap-2.5">
            <KpiTile
              size="hero"
              label="Stock value"
              value={money(data.kpis.inventory_value)}
              icon={<Package size={17} weight="fill" />}
              to="/inventory"
            />
            <KpiTile
              size="hero"
              label="Profit"
              value={money(data.kpis.profit)}
              tone="good"
              icon={<TrendUp size={17} weight="fill" />}
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
              icon={<Warning size={13} weight="fill" />}
              to="/inventory"
            />
          </div>

          {data.low_stock_items.length > 0 && (
            <AlertBanner tone="warn">
              <strong className="font-semibold">{data.low_stock_items.length} item(s)</strong> have
              run low.{' '}
              <Link to="/purchase/new" className="font-semibold underline underline-offset-2">
                Restock now
              </Link>
            </AlertBanner>
          )}

          {!hasActivity ? (
            <Card>
              <EmptyState
                icon={<Sparkle size={24} weight="fill" />}
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
                />
                <RankedList
                  title="Most sold"
                  data={data.top_items_by_volume}
                  format={qty}
                  emptyLabel="No sales in this period."
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <RankedList
                  title="Stock value by category"
                  data={data.category_breakdown}
                  format={money}
                  emptyLabel="No items yet."
                />
                <RankedList
                  title="Spend by supplier"
                  data={data.supplier_spend}
                  format={money}
                  emptyLabel="No purchases in this period."
                />
              </div>

              <Card>
                <CardHeader
                  title="Recent activity"
                  action={
                    <Link
                      to="/reports"
                      className="flex items-center gap-0.5 text-xs font-semibold text-brand-text"
                    >
                      Reports
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
                                ? 'bg-brand-soft text-brand-soft-ink'
                                : 'bg-surface-2 text-ink-muted',
                            )}
                          >
                            {isSale ? (
                              <Tag size={15} weight="fill" />
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
