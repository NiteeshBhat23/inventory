import { ArrowRight, CheckCircle, Plus, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/apiClient'
import { invalidate } from '../lib/useQuery'
import { money, moneyPrecise, percent, qty } from '../lib/format'
import type { Item, SaleBatchResult, SaleLineResult } from '../lib/types'
import ItemTypeahead from '../components/ItemTypeahead'
import BackHeader from '../components/BackHeader'
import AlertBanner from '../components/AlertBanner'
import { Button, ButtonLink } from '../components/ui/Button'
import { NumberField } from '../components/ui/Field'
import { Card } from '../components/ui/Card'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/cn'

interface Line {
  key: string
  query: string
  selected: Item | null
  quantity: string
  salePrice: string
  override: boolean
}

function newLine(): Line {
  return { key: crypto.randomUUID(), query: '', selected: null, quantity: '', salePrice: '', override: false }
}

export default function RecordSale() {
  const navigate = useNavigate()
  const toast = useToast()
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<SaleLineResult[]>([])
  const [result, setResult] = useState<SaleBatchResult | null>(null)

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  const totals = lines.reduce(
    (acc, l) => {
      const q = Number(l.quantity) || 0
      const p = Number(l.salePrice) || 0
      const c = l.selected ? Number(l.selected.avg_cost) : 0
      if (l.selected && q > 0 && p > 0) {
        acc.revenue += q * p
        acc.profit += (p - c) * q
      }
      return acc
    },
    { revenue: 0, profit: 0 },
  )

  async function submit() {
    setError(null)
    setBlocked([])
    const payloadLines = []

    for (const [i, l] of lines.entries()) {
      if (!l.selected) {
        setError(`Choose an item from your inventory for line ${i + 1}.`)
        return
      }
      const q = Number(l.quantity)
      if (!q || q <= 0) {
        setError(`Enter a quantity greater than zero for ${l.selected.canonical_name}.`)
        return
      }
      const p = Number(l.salePrice)
      if (!p || p <= 0) {
        setError(`Enter a selling price for ${l.selected.canonical_name}.`)
        return
      }
      payloadLines.push({
        item_id: l.selected.item_id,
        quantity: q,
        sale_price: p,
        override_below_cost: l.override,
      })
    }

    setBusy(true)
    try {
      const res = await api.post<SaleBatchResult>('/sales', { lines: payloadLines })
      invalidate('/dashboard', '/insights', '/items', '/sales', '/purchases')
      setResult(res)
      toast.success(`Sale recorded — profit ${money(res.total_profit)}`)
    } catch (err) {
      // 409 means the backend rejected the whole batch and told us exactly which
      // lines failed and why, so surface those per-line rather than one vague message.
      if (err instanceof ApiError && err.status === 409 && err.body && typeof err.body === 'object') {
        const body = err.body as SaleBatchResult
        setBlocked(body.lines.filter((l) => l.blocked))
        setError('Some lines need attention before this sale can be saved.')
        toast.error('Sale not saved — check the highlighted lines')
      } else {
        const msg = err instanceof ApiError ? err.message : 'Could not record sale'
        setError(msg)
        toast.error(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <BackHeader title="Sale recorded" fallback="/" />

        <Card className="border-good/30 bg-good-soft">
          <div className="flex items-start gap-3">
            <CheckCircle size={22} weight="duotone" className="mt-0.5 shrink-0 text-good-soft-ink" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-good-soft-ink">
              <p className="text-sm font-semibold">{result.items_sold} item(s) sold</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">Revenue</p>
                  <p className="nums font-display text-xl font-semibold">{money(result.total_revenue)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">Profit</p>
                  <p className="nums font-display text-xl font-semibold">{money(result.total_profit)}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {result.below_cost_count > 0 && (
          <AlertBanner tone="bad">
            {result.below_cost_count} line(s) were sold below cost. Consider reviewing the selling
            price for those items.
          </AlertBanner>
        )}

        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            fullWidth
            icon={<Plus size={18} weight="bold" aria-hidden="true" />}
            onClick={() => {
              setResult(null)
              setLines([newLine()])
            }}
          >
            Record another
          </Button>
          <ButtonLink to="/" fullWidth icon={<ArrowRight size={18} weight="bold" aria-hidden="true" />}>
            Done
          </ButtonLink>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BackHeader title="Record Sale" subtitle="Parts used or sold to a customer" fallback="/" />

      <div className="space-y-3">
        {lines.map((l, idx) => {
          const blockedLine = blocked.find((b) => b.item_id === l.selected?.item_id)
          const q = Number(l.quantity) || 0
          const price = Number(l.salePrice) || 0
          const cost = l.selected ? Number(l.selected.avg_cost) : 0
          const lineProfit = (price - cost) * q
          // Margin = profit relative to cost, not to price — buy at 150, sell
          // at 300, that's 150 profit on a 150 cost, a 100% margin.
          const marginPct = cost > 0 ? ((price - cost) / cost) * 100 : 0
          const belowCost = !!l.selected && price > 0 && price < cost
          const needsOverride = belowCost && !l.override
          const stock = l.selected ? Number(l.selected.stock_qty) : 0
          const overStock = !!l.selected && q > stock

          return (
            <Card
              key={l.key}
              className={cn((blockedLine || needsOverride || overStock) && 'border-danger/40')}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Item {idx + 1}
                </span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    aria-label={`Remove item ${idx + 1}`}
                    className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger-text"
                  >
                    <Trash size={17} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {l.selected ? (
                  <div>
                    <span className="mb-1.5 block text-sm font-semibold text-ink">Item</span>
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          {l.selected.canonical_name}
                        </span>
                        <span className="nums block text-xs text-ink-muted">
                          In stock {qty(l.selected.stock_qty)} {l.selected.unit} · cost{' '}
                          {moneyPrecise(l.selected.avg_cost)}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateLine(l.key, { selected: null, query: '', override: false })}
                      >
                        Change
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ItemTypeahead
                    label="Item"
                    placeholder="Search your inventory"
                    hint="A sale can only use items already in stock"
                    value={l.query}
                    onChangeText={(text) => updateLine(l.key, { query: text })}
                    onSelectExisting={(item) =>
                      updateLine(l.key, { selected: item, salePrice: String(item.selling_price || '') })
                    }
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Quantity"
                    required
                    placeholder="0"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                    error={overStock ? `Only ${qty(stock)} in stock` : undefined}
                  />
                  <NumberField
                    label="Selling price"
                    required
                    prefix="₹"
                    placeholder="0.00"
                    value={l.salePrice}
                    onChange={(e) => updateLine(l.key, { salePrice: e.target.value })}
                  />
                </div>

                {/* Live margin maths: the owner is choosing a price right now, so
                    the consequence of that choice should be visible before they
                    commit, not discovered in a report next month. */}
                {l.selected && price > 0 && (
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-center">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Cost</p>
                      <p className="nums text-sm font-semibold text-ink">{moneyPrecise(cost)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Margin</p>
                      <p
                        className={cn(
                          'nums text-sm font-semibold',
                          belowCost ? 'text-danger-text' : 'text-ink',
                        )}
                      >
                        {percent(marginPct)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Profit</p>
                      <p
                        className={cn(
                          'nums text-sm font-semibold',
                          lineProfit < 0 ? 'text-danger-text' : 'text-good-text',
                        )}
                      >
                        {money(lineProfit)}
                      </p>
                    </div>
                  </div>
                )}

                {(belowCost || blockedLine) && (
                  <div className="space-y-2">
                    <AlertBanner tone="bad">
                      {blockedLine?.block_reason ??
                        `This price is below your cost of ${moneyPrecise(cost)} — you would lose ${moneyPrecise(cost - price)} per unit.`}
                    </AlertBanner>
                    {belowCost && (
                      // Deliberate friction: selling below cost is sometimes a
                      // real decision, so it's allowed — but only explicitly.
                      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger-soft-ink">
                        <input
                          type="checkbox"
                          checked={l.override}
                          onChange={(e) => updateLine(l.key, { override: e.target.checked })}
                          className="h-4.5 w-4.5 shrink-0 accent-[var(--danger)]"
                        />
                        Sell below cost anyway
                      </label>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <Button
        variant="secondary"
        fullWidth
        icon={<Plus size={18} weight="bold" aria-hidden="true" />}
        onClick={() => setLines((prev) => [...prev, newLine()])}
      >
        Add another item
      </Button>

      {totals.revenue > 0 && (
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                Total revenue
              </p>
              <p className="nums font-display text-xl font-semibold text-ink">{money(totals.revenue)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                Total profit
              </p>
              <p
                className={cn(
                  'nums font-display text-xl font-semibold',
                  totals.profit < 0 ? 'text-danger-text' : 'text-good-text',
                )}
              >
                {money(totals.profit)}
              </p>
            </div>
          </div>
        </Card>
      )}

      {error && <AlertBanner tone="bad">{error}</AlertBanner>}

      <div className="flex gap-2.5 pt-1">
        <Button variant="secondary" fullWidth onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button fullWidth loading={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Record sale'}
        </Button>
      </div>
    </div>
  )
}
