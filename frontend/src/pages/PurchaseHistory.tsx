import { Receipt } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '../lib/useQuery'
import { money, moneyPrecise, qty, shortDate } from '../lib/format'
import type { PurchaseHistoryEntry } from '../lib/types'
import BackHeader from '../components/BackHeader'
import { Card, CardHeader, CardList, CardListRow } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { ListSkeleton } from '../components/ui/Skeleton'
import { SelectField } from '../components/ui/Field'
import { PERIODS } from '../lib/periods'

/** Groups the flat purchase list by calendar day, matching the sale-history
 *  drill-down — a shop owner thinks in "what did I spend today / this week". */
function groupByDay(entries: PurchaseHistoryEntry[]) {
  const groups = new Map<string, PurchaseHistoryEntry[]>()
  for (const e of entries) {
    const key = shortDate(e.purchase_date)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }
  return [...groups.entries()]
}

export default function PurchaseHistory() {
  const [searchParams] = useSearchParams()
  const supplier = searchParams.get('supplier')

  const [days, setDays] = useState(90)
  const { data: entries, loading } = useQuery<PurchaseHistoryEntry[]>(
    `/purchases?days=${days}${supplier ? `&supplier=${encodeURIComponent(supplier)}` : ''}`,
  )

  const totals = useMemo(() => {
    if (!entries) return { spend: 0, count: 0 }
    return entries.reduce(
      (acc, e) => {
        acc.spend += e.total_price
        acc.count += 1
        return acc
      },
      { spend: 0, count: 0 },
    )
  }, [entries])

  const grouped = useMemo(() => groupByDay(entries ?? []), [entries])

  return (
    <div className="space-y-4">
      <BackHeader
        title="Purchase details"
        subtitle={
          supplier
            ? `Every purchase from ${supplier} — line by line.`
            : 'Every purchase in this period — line by line.'
        }
        fallback="/reports"
      />

      <Card>
        <SelectField label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </SelectField>
      </Card>

      {supplier && (
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted">
            Supplier: <span className="text-ink">{supplier}</span>
          </span>
          <Link
            to="/purchases/history"
            className="text-xs font-semibold text-brand-text underline underline-offset-2"
          >
            Clear filter
          </Link>
        </div>
      )}

      {loading && !entries && <ListSkeleton rows={4} />}

      {entries && entries.length === 0 && (
        <Card>
          <EmptyState
            icon={<Receipt size={24} weight="duotone" />}
            title="No purchases in this period"
            description={
              supplier
                ? `No purchases from ${supplier} in this window — try a longer period.`
                : "Log a purchase and it'll show up here with the full supplier breakdown."
            }
          />
        </Card>
      )}

      {entries && entries.length > 0 && (
        <>
          <Card>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                Total spend
              </p>
              <p className="nums mt-0.5 font-display text-2xl font-semibold text-ink">
                {money(totals.spend)}
              </p>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              From {totals.count} purchase{totals.count === 1 ? '' : 's'} in this period
            </p>
          </Card>

          {grouped.map(([day, dayEntries]) => {
            const daySpend = dayEntries.reduce((s, e) => s + e.total_price, 0)
            return (
              <Card key={day}>
                <CardHeader
                  title={day}
                  subtitle={`${dayEntries.length} purchase${dayEntries.length === 1 ? '' : 's'}`}
                  action={
                    <div className="text-right">
                      <p className="nums text-sm font-semibold text-ink">{money(daySpend)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-muted">spend</p>
                    </div>
                  }
                />
                <CardList>
                  {dayEntries.map((e) => (
                    <CardListRow key={e.purchase_id} className="items-start">
                      <span className="flex min-w-0 items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-muted"
                        >
                          <Receipt size={15} weight="duotone" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">
                            {e.item_name}
                          </span>
                          <span className="nums block text-xs text-ink-muted">
                            {qty(e.quantity)} × {moneyPrecise(e.unit_price)}
                            {!supplier && e.supplier_name && ` — ${e.supplier_name}`}
                          </span>
                        </span>
                      </span>
                      <span className="nums shrink-0 text-right text-sm font-semibold text-ink">
                        {money(e.total_price)}
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
