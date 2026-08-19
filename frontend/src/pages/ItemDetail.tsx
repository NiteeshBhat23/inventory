import { Archive, ClockCounterClockwise, PencilSimple } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { invalidate } from '../lib/useQuery'
import { moneyPrecise, percent, qty, shortDate } from '../lib/format'
import type { Item, PurchaseHistoryEntry } from '../lib/types'
import AlertBanner from '../components/AlertBanner'
import BackHeader from '../components/BackHeader'
import { useAuth } from '../lib/AuthContext'
import { Button } from '../components/ui/Button'
import { NumberField } from '../components/ui/Field'
import { Card, CardHeader, CardList, CardListRow } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { ListSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { cn } from '../lib/cn'

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'default' | 'bad'
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p
        className={cn(
          'nums mt-0.5 font-display text-lg font-semibold',
          tone === 'bad' ? 'text-danger-text' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  )
}

export default function ItemDetail() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { shop } = useAuth()

  const [item, setItem] = useState<Item | null>(null)
  const [history, setHistory] = useState<PurchaseHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [editingPrice, setEditingPrice] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [editingThreshold, setEditingThreshold] = useState(false)
  const [thresholdInput, setThresholdInput] = useState('')
  const [editingMargin, setEditingMargin] = useState(false)
  const [marginInput, setMarginInput] = useState('')
  const [saving, setSaving] = useState(false)

  const shopDefault = shop?.default_low_stock_threshold ?? 5
  const shopDefaultMargin = shop?.default_target_margin_pct ?? 20

  useEffect(() => {
    if (!itemId) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.get<Item>(`/items/${itemId}`),
      api.get<PurchaseHistoryEntry[]>(`/items/${itemId}/purchase-history`),
    ])
      .then(([i, h]) => {
        if (cancelled) return
        setItem(i)
        setPriceInput(String(i.selling_price))
        setThresholdInput(String(i.low_stock_threshold ?? shopDefault))
        setMarginInput(String(i.target_margin_pct ?? shopDefaultMargin))
        setHistory(h)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [itemId, shopDefault, shopDefaultMargin])

  async function patch(body: Record<string, unknown>, successMsg: string) {
    if (!item) return
    setSaving(true)
    try {
      const updated = await api.patch<Item>(`/items/${item.item_id}`, body)
      invalidate('/dashboard', '/insights', '/items', '/sales', '/purchases')
      setItem(updated)
      toast.success(successMsg)
      return updated
    } catch {
      toast.error('Could not save the change')
    } finally {
      setSaving(false)
    }
  }

  async function savePrice() {
    const updated = await patch({ selling_price: Number(priceInput) }, 'Selling price updated')
    if (updated) setEditingPrice(false)
  }

  async function saveThreshold() {
    const updated = await patch(
      { low_stock_threshold: Number(thresholdInput) },
      'Low-stock alert updated',
    )
    if (updated) setEditingThreshold(false)
  }

  async function resetThreshold() {
    // Explicit null clears the per-item override so the item follows the shop
    // default again; omitting the key would leave the old value in place.
    const updated = await patch({ low_stock_threshold: null }, 'Using shop default again')
    if (updated) {
      setThresholdInput(String(shopDefault))
      setEditingThreshold(false)
    }
  }

  async function saveMargin() {
    const updated = await patch(
      { target_margin_pct: Number(marginInput) },
      'Target margin updated',
    )
    if (updated) setEditingMargin(false)
  }

  async function resetMargin() {
    // Same convention as the low-stock threshold: explicit null clears the
    // per-item override so this item follows the shop's default target
    // margin again, which is also what the low-margin alert falls back to.
    const updated = await patch({ target_margin_pct: null }, 'Using shop default again')
    if (updated) {
      setMarginInput(String(shopDefaultMargin))
      setEditingMargin(false)
    }
  }

  async function archiveItem() {
    if (!item) return
    const ok = await confirm({
      title: `Archive ${item.canonical_name}?`,
      message:
        'It will be hidden from your stock list. Past purchases and sales stay in your records.',
      confirmLabel: 'Archive',
      destructive: true,
    })
    if (!ok) return
    try {
      await api.delete(`/items/${item.item_id}`)
      invalidate('/dashboard', '/insights', '/items', '/sales', '/purchases')
      toast.success(`${item.canonical_name} archived`)
      navigate('/inventory')
    } catch {
      toast.error('Could not archive this item')
    }
  }

  if (loading && !item) {
    return (
      <div className="space-y-4">
        <BackHeader title="Loading…" fallback="/inventory" />
        <ListSkeleton rows={3} />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="space-y-4">
        <BackHeader title="Item not found" fallback="/inventory" />
        <EmptyState
          icon={<Archive size={24} weight="duotone" />}
          title="This item isn't available"
          description="It may have been archived or removed."
        />
      </div>
    )
  }

  const threshold = item.low_stock_threshold ?? shopDefault
  const usingDefault = item.low_stock_threshold == null
  const targetMargin = item.target_margin_pct ?? shopDefaultMargin
  const usingDefaultMargin = item.target_margin_pct == null

  return (
    <div className="space-y-4">
      <BackHeader title={item.canonical_name} subtitle={`per ${item.unit}`} fallback="/inventory" />

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Average cost" value={moneyPrecise(item.avg_cost)} />
          <Stat label="In stock" value={`${qty(item.stock_qty)} ${item.unit}`} />
        </div>

        <div className="mt-4 border-t border-line pt-4">
          {editingPrice ? (
            <div className="space-y-3">
              <NumberField
                label="Selling price"
                prefix="₹"
                autoFocus
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                hint={
                  item.suggested_selling_price != null
                    ? `Suggested ${moneyPrecise(item.suggested_selling_price)} at your target margin`
                    : undefined
                }
              />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" fullWidth onClick={() => setEditingPrice(false)}>
                  Cancel
                </Button>
                <Button size="sm" fullWidth loading={saving} onClick={savePrice}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Selling price
                </p>
                <p className="nums mt-0.5 font-display text-2xl font-semibold text-ink">
                  {moneyPrecise(item.selling_price)}
                </p>
                <p
                  className={cn(
                    'nums mt-0.5 text-xs',
                    item.is_below_cost ? 'font-semibold text-danger-text' : 'text-ink-muted',
                  )}
                >
                  {item.is_below_cost ? 'Below cost' : `${percent(item.margin_pct)} margin`}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={<PencilSimple size={16} weight="bold" aria-hidden="true" />}
                onClick={() => setEditingPrice(true)}
              >
                Edit
              </Button>
            </div>
          )}
        </div>
      </Card>

      {item.is_below_cost && (
        <AlertBanner tone="bad">
          You're selling at {moneyPrecise(item.selling_price)} but it costs you{' '}
          {moneyPrecise(item.avg_cost)} — a loss of{' '}
          <strong className="font-semibold">
            {moneyPrecise(Number(item.avg_cost) - Number(item.selling_price))}
          </strong>{' '}
          per {item.unit}.
        </AlertBanner>
      )}
      {item.wont_restock ? (
        // Distinct from is_low_stock being merely false: this says the
        // owner actively dismissed the alert, and offers the way back —
        // otherwise there'd be no visible trace this item was ever flagged.
        <AlertBanner tone="warn">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Marked as not restocking — hidden from low-stock alerts.</span>
            <Button
              size="sm"
              variant="ghost"
              loading={saving}
              onClick={() => patch({ wont_restock: false }, 'Low-stock alerts resumed')}
            >
              Resume alerts
            </Button>
          </div>
        </AlertBanner>
      ) : (
        item.is_low_stock && (
          <AlertBanner tone="warn">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Only {qty(item.stock_qty)} {item.unit} left — at or below your alert level of{' '}
                {qty(threshold)}.
              </span>
              {/* For the "sold out and not reordering" case — hides this item
                  from low-stock alerts without touching its cost/stock/sales
                  history. A later purchase clears this automatically. */}
              <Button
                size="sm"
                variant="ghost"
                loading={saving}
                onClick={() => patch({ wont_restock: true }, "Won't show as low stock")}
              >
                Not restocking this item
              </Button>
            </div>
          </AlertBanner>
        )
      )}

      <Card>
        <CardHeader
          title="Low-stock alert"
          subtitle={
            usingDefault
              ? `Using the shop default of ${qty(shopDefault)} ${item.unit}`
              : `Custom for this item`
          }
          action={
            !editingThreshold ? (
              <Button size="sm" variant="secondary" onClick={() => setEditingThreshold(true)}>
                Change
              </Button>
            ) : undefined
          }
        />

        {editingThreshold ? (
          <div className="space-y-3">
            <NumberField
              label={`Warn me when stock drops to (${item.unit})`}
              autoFocus
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditingThreshold(false)}>
                Cancel
              </Button>
              <Button size="sm" loading={saving} onClick={saveThreshold}>
                Save
              </Button>
              {!usingDefault && (
                <Button size="sm" variant="ghost" onClick={resetThreshold}>
                  Use shop default
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="nums font-display text-lg font-semibold text-ink">
            {qty(threshold)} {item.unit}
          </p>
        )}
      </Card>

      {/* This is what the Insights "low margin" alert compares this item's
          real selling margin against — without a per-item value here, every
          item was silently judged against the shop default instead. */}
      <Card>
        <CardHeader
          title="Target margin"
          subtitle={
            usingDefaultMargin
              ? `Using the shop default of ${percent(shopDefaultMargin)}`
              : `Custom for this item`
          }
          action={
            !editingMargin ? (
              <Button size="sm" variant="secondary" onClick={() => setEditingMargin(true)}>
                Change
              </Button>
            ) : undefined
          }
        />

        {editingMargin ? (
          <div className="space-y-3">
            <NumberField
              label="Target margin (%)"
              autoFocus
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              hint="Used for low-margin alerts, and to suggest a price on future purchases."
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditingMargin(false)}>
                Cancel
              </Button>
              <Button size="sm" loading={saving} onClick={saveMargin}>
                Save
              </Button>
              {!usingDefaultMargin && (
                <Button size="sm" variant="ghost" onClick={resetMargin}>
                  Use shop default
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="nums font-display text-lg font-semibold text-ink">{percent(targetMargin)}</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Purchase history" subtitle={`${history.length} recorded`} />
        {history.length === 0 ? (
          <EmptyState
            compact
            icon={<ClockCounterClockwise size={22} weight="duotone" />}
            title="No purchases yet"
            description="Each purchase you log will appear here with the price you paid."
          />
        ) : (
          <CardList>
            {history.map((h) => (
              <CardListRow key={h.purchase_id}>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{shortDate(h.purchase_date)}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {h.supplier_name ?? 'Supplier not recorded'}
                  </span>
                </span>
                <span className="nums shrink-0 text-right">
                  <span className="block text-sm font-semibold text-ink">
                    {moneyPrecise(h.unit_price)}
                  </span>
                  <span className="block text-xs text-ink-muted">× {qty(h.quantity)}</span>
                </span>
              </CardListRow>
            ))}
          </CardList>
        )}
      </Card>

      {/* Destructive action sits apart from everything else, after a divider,
          so it can't be hit while scanning the normal controls above. */}
      <div className="border-t border-line pt-4">
        <Button
          variant="danger"
          fullWidth
          icon={<Archive size={18} weight="bold" aria-hidden="true" />}
          onClick={archiveItem}
        >
          Archive this item
        </Button>
      </div>
    </div>
  )
}
