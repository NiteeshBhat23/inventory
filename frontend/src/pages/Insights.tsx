import {
  ArrowsClockwise,
  CalendarBlank,
  ChartLineUp,
  Gauge,
  HandCoins,
  Hourglass,
  Percent,
  Truck,
} from '@phosphor-icons/react'
import { lazy, Suspense, useState } from 'react'
import BackHeader from '../components/BackHeader'
import ItemTypeahead from '../components/ItemTypeahead'
import { Card, CardHeader, CardList, CardListRow } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { ListSkeleton } from '../components/ui/Skeleton'
import { SelectField } from '../components/ui/Field'
import { money, moneyPrecise, percent, qty, shortDate } from '../lib/format'
import { PERIODS } from '../lib/periods'
import { useQuery } from '../lib/useQuery'
import { cn } from '../lib/cn'
import type {
  AgingRow,
  Item,
  LowMarginRow,
  PriceHistoryData,
  ProfitLeaderboardRow,
  ReorderRow,
  SupplierPriceRow,
  TimingRow,
  VelocityRow,
} from '../lib/types'
import type { InsightsData } from '../lib/types'

// Recharts is the single heaviest dependency in the app (~150kB) — deferred
// into its own chunk so it only downloads if someone actually opens the
// price-history chart, not on every visit to this page.
const PriceHistoryChart = lazy(() => import('../components/PriceHistoryChart'))

function Pill({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'default'; children: React.ReactNode }) {
  const cls = {
    good: 'bg-good-soft text-good-soft-ink',
    warn: 'bg-warn-soft text-warn-soft-ink',
    bad: 'bg-danger-soft text-danger-soft-ink',
    default: 'bg-surface-2 text-ink-muted',
  }[tone]
  return (
    <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', cls)}>
      {children}
    </span>
  )
}

function SectionIcon({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'default'; children: React.ReactNode }) {
  const cls = {
    good: 'bg-good-soft text-good-soft-ink',
    warn: 'bg-warn-soft text-warn-soft-ink',
    bad: 'bg-danger-soft text-danger-soft-ink',
    default: 'bg-brand-soft text-brand-soft-ink',
  }[tone]
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', cls)} aria-hidden="true">
      {children}
    </span>
  )
}

// ---------- Profit leaderboard ----------
function ProfitLeaderboard({ rows }: { rows: ProfitLeaderboardRow[] }) {
  return (
    <Card>
      <CardHeader
        title="Profit leaderboard"
        subtitle="Every item that sold this period, ranked by total profit"
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<SectionIcon tone="default"><ChartLineUp size={18} weight="duotone" /></SectionIcon>}
          title="No sales in this period"
          compact
        />
      ) : (
        <CardList>
          {rows.map((r) => (
            <CardListRow key={r.item_id}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{r.item_name}</span>
                <span className="nums block text-xs text-ink-muted">
                  {qty(r.units_sold)} sold · {moneyPrecise(r.profit_per_unit)}/unit
                </span>
              </span>
              <span className="nums shrink-0 text-right">
                <span className="block text-sm font-semibold text-good-text">{money(r.total_profit)}</span>
                <span className="block text-xs text-ink-muted">{percent(r.margin_pct)} margin</span>
              </span>
            </CardListRow>
          ))}
        </CardList>
      )}
    </Card>
  )
}

// ---------- Sales velocity ----------
function Velocity({ rows }: { rows: VelocityRow[] }) {
  return (
    <Card>
      <CardHeader title="Sales velocity" subtitle="What's moving fastest, by units per day" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<SectionIcon tone="default"><Gauge size={18} weight="duotone" /></SectionIcon>}
          title="No sales in this period"
          compact
        />
      ) : (
        <CardList>
          {rows.slice(0, 10).map((r) => (
            <CardListRow key={r.item_id}>
              <span className="truncate text-sm font-medium text-ink">{r.item_name}</span>
              <span className="nums shrink-0 text-right text-sm font-semibold text-ink">
                {r.units_per_day.toFixed(2)}/day
              </span>
            </CardListRow>
          ))}
        </CardList>
      )}
    </Card>
  )
}

// ---------- Dead stock / aging ----------
const AGING_TONE: Record<string, 'good' | 'warn' | 'bad' | 'default'> = {
  '0-30 days': 'good',
  '31-60 days': 'default',
  '61-90 days': 'warn',
  '90+ days': 'bad',
  'never sold': 'bad',
}

function Aging({ rows }: { rows: AgingRow[] }) {
  return (
    <Card>
      <CardHeader
        title="Dead stock &amp; aging"
        subtitle="What's sitting the longest since it last sold"
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<SectionIcon tone="default"><Hourglass size={18} weight="duotone" /></SectionIcon>}
          title="No stock to age yet"
          compact
        />
      ) : (
        <CardList>
          {rows.slice(0, 12).map((r) => (
            <CardListRow key={r.item_id} className="items-start">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{r.item_name}</span>
                <span className="nums block text-xs text-ink-muted">
                  {qty(r.stock_qty)} in stock
                  {r.sell_through_pct !== null && ` · ${percent(r.sell_through_pct)} sell-through`}
                </span>
              </span>
              <Pill tone={AGING_TONE[r.bucket] ?? 'default'}>{r.bucket}</Pill>
            </CardListRow>
          ))}
        </CardList>
      )}
    </Card>
  )
}

// ---------- Supplier price comparison ----------
function SupplierComparison({ rows }: { rows: SupplierPriceRow[] }) {
  const overpaying = rows.filter((r) => r.overpaying)
  return (
    <Card>
      <CardHeader
        title="Supplier price comparison"
        subtitle={
          overpaying.length > 0
            ? `${overpaying.length} item(s) currently cost more than the best price you've recorded`
            : "Your cheapest recorded price per item, and who sold it to you"
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<SectionIcon tone="default"><Truck size={18} weight="duotone" /></SectionIcon>}
          title="No purchases recorded yet"
          compact
        />
      ) : (
        <CardList>
          {rows.slice(0, 10).map((r) => (
            <CardListRow key={r.item_id} className="items-start">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{r.item_name}</span>
                <span className="nums block text-xs text-ink-muted">
                  Best: {moneyPrecise(r.best_price)} from {r.best_supplier} · {shortDate(r.best_price_date)}
                  {r.supplier_count > 1 && ` · ${r.supplier_count} suppliers`}
                </span>
              </span>
              <span className="nums shrink-0 text-right">
                <span
                  className={cn(
                    'block text-sm font-semibold',
                    r.overpaying ? 'text-warn-text' : 'text-ink',
                  )}
                >
                  {moneyPrecise(r.current_avg_cost)}
                </span>
                <span className="block text-xs text-ink-muted">current cost</span>
              </span>
            </CardListRow>
          ))}
        </CardList>
      )}
    </Card>
  )
}

// ---------- Low margin alert ----------
function LowMargin({ rows }: { rows: LowMarginRow[] }) {
  return (
    <Card>
      <CardHeader
        title="Low margin alert"
        subtitle="Selling below your own target margin for these items"
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<SectionIcon tone="good"><Percent size={18} weight="duotone" /></SectionIcon>}
          title="Nothing below target"
          description="Every priced item is meeting or beating its target margin."
          compact
        />
      ) : (
        <CardList>
          {rows.slice(0, 10).map((r) => (
            <CardListRow key={r.item_id}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{r.item_name}</span>
                <span className="nums block text-xs text-ink-muted">
                  {moneyPrecise(r.avg_cost)} cost → {moneyPrecise(r.selling_price)}
                </span>
              </span>
              <span className="nums shrink-0 text-right">
                <span
                  className={cn(
                    'block text-sm font-semibold',
                    r.is_below_cost ? 'text-danger-text' : 'text-warn-text',
                  )}
                >
                  {r.is_below_cost ? 'below cost' : percent(r.margin_pct)}
                </span>
                <span className="block text-xs text-ink-muted">target {percent(r.target_margin_pct)}</span>
              </span>
            </CardListRow>
          ))}
        </CardList>
      )}
    </Card>
  )
}

// ---------- Purchase-to-sale timing ----------
function Timing({ rows }: { rows: TimingRow[] }) {
  return (
    <Card>
      <CardHeader
        title="Purchase-to-sale timing"
        subtitle="How long an item typically sits before it sells"
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<SectionIcon tone="default"><CalendarBlank size={18} weight="duotone" /></SectionIcon>}
          title="Not enough history yet"
          description="Once an item has been both purchased and sold, its timing shows up here."
          compact
        />
      ) : (
        <CardList>
          {rows.slice(0, 10).map((r) => (
            <CardListRow key={r.item_id}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{r.item_name}</span>
                <span className="text-xs text-ink-muted">
                  from {r.sample_size} sale{r.sample_size === 1 ? '' : 's'}
                </span>
              </span>
              <span className="nums shrink-0 text-sm font-semibold text-ink">
                {r.avg_days_to_sell} day{r.avg_days_to_sell === 1 ? '' : 's'}
              </span>
            </CardListRow>
          ))}
        </CardList>
      )}
    </Card>
  )
}

// ---------- Reorder suggestions ----------
function Reorder({ rows }: { rows: ReorderRow[] }) {
  return (
    <Card>
      <CardHeader
        title="Reorder suggestions"
        subtitle="Selling faster than your stock will last — enough to cover 30 days"
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<SectionIcon tone="good"><ArrowsClockwise size={18} weight="duotone" /></SectionIcon>}
          title="Nothing urgent"
          description="No fast-moving item is running low right now."
          compact
        />
      ) : (
        <CardList>
          {rows.map((r) => (
            <CardListRow key={r.item_id}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{r.item_name}</span>
                <span className="nums block text-xs text-warn-text">
                  {r.days_of_stock_left} day{r.days_of_stock_left === 1 ? '' : 's'} of stock left
                </span>
              </span>
              <span className="nums shrink-0 text-right">
                <span className="block text-sm font-semibold text-ink">+{qty(r.suggested_reorder_qty)}</span>
                <span className="block text-xs text-ink-muted">suggested</span>
              </span>
            </CardListRow>
          ))}
        </CardList>
      )}
    </Card>
  )
}

// ---------- Price history chart ----------
function PriceHistorySection() {
  const [item, setItem] = useState<Item | null>(null)
  const [query, setQuery] = useState('')
  const { data, loading } = useQuery<PriceHistoryData>(
    item ? `/insights/price-history/${item.item_id}` : null,
  )

  return (
    <Card>
      <CardHeader title="Price history" subtitle="What you paid, and what you charged, over time" />
      <ItemTypeahead
        label="Item"
        value={item ? item.canonical_name : query}
        onChangeText={(text) => {
          setQuery(text)
          if (item) setItem(null)
        }}
        onSelectExisting={(picked) => {
          setItem(picked)
          setQuery(picked.canonical_name)
        }}
        placeholder="Search for an item…"
      />

      {item && loading && <div className="mt-4"><ListSkeleton rows={1} /></div>}

      {item && !loading && data && data.points.length === 0 && (
        <div className="mt-2">
          <EmptyState
            icon={<SectionIcon tone="default"><ChartLineUp size={18} weight="duotone" /></SectionIcon>}
            title="No price history yet"
            description="Cost shows up here from your next purchase; selling price shows up here from your next edit."
            compact
          />
        </div>
      )}

      {item && !loading && data && data.points.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-4 text-xs font-medium text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" /> Cost
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-good" aria-hidden="true" /> Selling price
            </span>
          </div>
          <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-surface-2" />}>
            <PriceHistoryChart points={data.points} />
          </Suspense>
        </div>
      )}
    </Card>
  )
}

export default function Insights() {
  const [days, setDays] = useState(90)
  const { data, loading } = useQuery<InsightsData>(`/insights?days=${days}`)

  const hasAnyData =
    !!data &&
    (data.profit_leaderboard.length > 0 ||
      data.aging.length > 0 ||
      data.supplier_comparison.length > 0)

  return (
    <div className="space-y-4">
      <BackHeader
        title="Insights"
        subtitle="What's working, what's stuck, and what to do next"
        fallback="/"
      />

      <Card>
        <SelectField
          label="Period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          hint="Applies to profit, velocity, and aging below — supplier and timing always look at your full history"
        >
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </SelectField>
      </Card>

      {loading && !data && <ListSkeleton rows={4} />}

      {data && !hasAnyData && (
        <Card>
          <EmptyState
            icon={<SectionIcon tone="default"><HandCoins size={20} weight="duotone" /></SectionIcon>}
            title="Nothing to show yet"
            description="Once you've logged some purchases and sales, this page fills in with what's actually working."
          />
        </Card>
      )}

      {data && hasAnyData && (
        <>
          <ProfitLeaderboard rows={data.profit_leaderboard} />
          <Velocity rows={data.velocity} />
          <Reorder rows={data.reorder} />
          <Aging rows={data.aging} />
          <LowMargin rows={data.low_margin} />
          <SupplierComparison rows={data.supplier_comparison} />
          <Timing rows={data.timing} />
          <PriceHistorySection />
        </>
      )}
    </div>
  )
}
