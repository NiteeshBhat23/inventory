import { ChartLine, Tag } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { money, moneyPrecise, qty, shortDate } from '../lib/format'
import type { SaleHistoryEntry } from '../lib/types'
import BackHeader from '../components/BackHeader'
import { Card, CardHeader, CardList, CardListRow } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { ListSkeleton } from '../components/ui/Skeleton'
import { SelectField } from '../components/ui/Field'
import { cn } from '../lib/cn'

type Metric = 'profit' | 'revenue'

const COPY: Record<Metric, { title: string; description: string }> = {
  profit: {
    title: 'Profit details',
    description: 'Every sale that contributed to your profit — line by line, cost vs. what you charged.',
  },
  revenue: {
    title: 'Revenue details',
    description: 'Every sale in this period — what you sold, how much, and for how much.',
  },
}

/** Groups the flat sale list by calendar day, since a shop owner thinks in
 *  "what did I make today / this week", not a single undifferentiated list. */
function groupByDay(entries: SaleHistoryEntry[]) {
  const groups = new Map<string, SaleHistoryEntry[]>()
  for (const e of entries) {
    const key = shortDate(e.sale_date)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }
  return [...groups.entries()]
}

export default function FinancialDetail() {
  const { metric } = useParams<{ metric: string }>()
  const activeMetric: Metric = metric === 'revenue' ? 'revenue' : 'profit'
  const copy = COPY[activeMetric]

  const [days, setDays] = useState(30)
  const [entries, setEntries] = useState<SaleHistoryEntry[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get<SaleHistoryEntry[]>(`/sales?days=${days}`)
      .then((d) => {
        if (!cancelled) setEntries(d)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])

  const totals = useMemo(() => {
    if (!entries) return { revenue: 0, profit: 0, cost: 0, count: 0 }
    return entries.reduce(
      (acc, e) => {
        acc.revenue += e.revenue
        acc.profit += e.profit
        acc.cost += e.cost_at_sale * e.quantity
        acc.count += 1
        return acc
      },
      { revenue: 0, profit: 0, cost: 0, count: 0 },
    )
  }, [entries])

  const grouped = useMemo(() => groupByDay(entries ?? []), [entries])

  return (
    <div className="space-y-4">
      <BackHeader title={copy.title} subtitle={copy.description} fallback="/" />

      <Card>
        <SelectField
          label="Period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </SelectField>
      </Card>

      {loading && !entries && <ListSkeleton rows={4} />}

      {entries && entries.length === 0 && (
        <Card>
          <EmptyState
            icon={<ChartLine size={24} weight="fill" />}
            title="No sales in this period"
            description="Record a sale and it'll show up here with the full cost/revenue/profit breakdown."
          />
        </Card>
      )}

      {entries && entries.length > 0 && (
        <>
          <Card className={activeMetric === 'profit' ? 'border-brand/30 bg-brand-soft' : undefined}>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Revenue
                </p>
                <p className="nums mt-0.5 font-display text-lg font-semibold text-ink">
                  {money(totals.revenue)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Cost</p>
                <p className="nums mt-0.5 font-display text-lg font-semibold text-ink">
                  {money(totals.cost)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Profit
                </p>
                <p
                  className={cn(
                    'nums mt-0.5 font-display text-lg font-semibold',
                    totals.profit < 0 ? 'text-danger-text' : 'text-brand-text',
                  )}
                >
                  {money(totals.profit)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              From {totals.count} sale{totals.count === 1 ? '' : 's'} in this period
            </p>
          </Card>

          {grouped.map(([day, dayEntries]) => {
            const dayRevenue = dayEntries.reduce((s, e) => s + e.revenue, 0)
            const dayProfit = dayEntries.reduce((s, e) => s + e.profit, 0)
            return (
              <Card key={day}>
                <CardHeader
                  title={day}
                  subtitle={`${dayEntries.length} sale${dayEntries.length === 1 ? '' : 's'}`}
                  action={
                    <div className="text-right">
                      <p className="nums text-sm font-semibold text-ink">
                        {activeMetric === 'profit' ? money(dayProfit) : money(dayRevenue)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                        {activeMetric}
                      </p>
                    </div>
                  }
                />
                <CardList>
                  {dayEntries.map((e) => (
                    <CardListRow key={e.sale_id} className="items-start">
                      <span className="flex min-w-0 items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-ink"
                        >
                          <Tag size={15} weight="fill" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">
                            {e.item_name}
                          </span>
                          <span className="nums block text-xs text-ink-muted">
                            {qty(e.quantity)} × {moneyPrecise(e.sale_price)} — cost{' '}
                            {moneyPrecise(e.cost_at_sale)}
                          </span>
                        </span>
                      </span>
                      <span className="nums shrink-0 text-right">
                        <span className="block text-sm font-semibold text-ink">
                          {money(e.revenue)}
                        </span>
                        <span
                          className={cn(
                            'block text-xs font-medium',
                            e.profit < 0 ? 'text-danger-text' : 'text-brand-text',
                          )}
                        >
                          {e.profit < 0 ? '−' : '+'}
                          {money(Math.abs(e.profit))} profit
                        </span>
                      </span>
                    </CardListRow>
                  ))}
                </CardList>
              </Card>
            )
          })}
        </>
      )}
    </div>
  )
}
