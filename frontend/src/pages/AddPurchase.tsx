import { ArrowRight, CheckCircle, Plus, Sparkle, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/apiClient'
import { invalidate } from '../lib/useQuery'
import { money, moneyPrecise, qty } from '../lib/format'
import { previewNewAvgCost } from '../lib/costPreview'
import type { BillExtraction, Item, MiscCharge, PurchaseBatchResult } from '../lib/types'
import ItemTypeahead from '../components/ItemTypeahead'
import SupplierTypeahead from '../components/SupplierTypeahead'
import BackHeader from '../components/BackHeader'
import BillScanner from '../components/BillScanner'
import AlertBanner from '../components/AlertBanner'
import { pushRecent } from '../lib/recents'
import { Button, ButtonLink } from '../components/ui/Button'
import { NumberField, TextField } from '../components/ui/Field'
import { Card } from '../components/ui/Card'
import { useToast } from '../components/ui/Toast'

interface Line {
  key: string
  query: string
  selected: Item | null
  isNew: boolean
  newName: string
  quantity: string
  price: string
  priceMode: 'unit' | 'total'
  // Display-only explanation of a scanned price, e.g. "+18% GST added" or
  // "price includes GST" — never sent to the server, purely so the owner can
  // see that the number in the field isn't the bare rate the bill printed.
  gstNote: string | null
}

function newLine(): Line {
  return {
    key: crypto.randomUUID(),
    query: '',
    selected: null,
    isNew: false,
    newName: '',
    quantity: '',
    price: '',
    priceMode: 'unit',
    gstNote: null,
  }
}

function unitPriceOf(l: Line): number | null {
  const q = Number(l.quantity)
  const p = Number(l.price)
  if (!p || p <= 0) return null
  if (l.priceMode === 'total') {
    if (!q || q <= 0) return null
    return p / q
  }
  return p
}

/** Prorates a bill-level charge (packing, freight) across lines by each
 *  line's share of the bill's total value, then folds that share into the
 *  line's unit price.
 *
 *  Only called when the owner explicitly opts in (see the misc-charge prompt
 *  below) — silently inflating costs with a charge they never confirmed
 *  would be worse than leaving it out entirely. Lines with no usable
 *  quantity/price are left untouched rather than divided evenly, since an
 *  even split would misattribute cost to items the bill didn't actually
 *  weight that way. */
function applyMiscCharges(lines: Line[], totalCharge: number): Line[] {
  const lineValues = lines.map((l) => {
    const q = Number(l.quantity) || 0
    const u = unitPriceOf(l) ?? 0
    return q * u
  })
  const totalValue = lineValues.reduce((sum, v) => sum + v, 0)
  if (totalValue <= 0) return lines

  return lines.map((l, i) => {
    const q = Number(l.quantity) || 0
    const u = unitPriceOf(l)
    if (q <= 0 || u === null) return l
    const share = (lineValues[i] / totalValue) * totalCharge
    const newUnit = u + share / q
    return { ...l, price: newUnit.toFixed(2), priceMode: 'unit' }
  })
}

export default function AddPurchase() {
  const navigate = useNavigate()
  const toast = useToast()
  const [supplier, setSupplier] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PurchaseBatchResult | null>(null)
  // Non-fatal notes from the scanner ("row 3 had no price"). Kept separate
  // from `error`, which means the save itself failed.
  const [scanNotes, setScanNotes] = useState<string[]>([])
  // Records that this batch came from a photo, so the committed rows are
  // tagged source='upload' and scan accuracy can be measured later.
  const [fromScan, setFromScan] = useState(false)
  // Bill-level charges (packing, freight) the scanner found but hasn't
  // applied — the owner explicitly opts in via the prompt below.
  const [miscCharges, setMiscCharges] = useState<MiscCharge[]>([])

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  /** Confidence above which we pre-select the catalog match outright rather
   *  than just naming it. Kept in sync with the server's STRONG_MATCH so the
   *  UI's idea of "confident" matches the one the matcher actually used —
   *  see backend/app/services/matching.py. */
  const STRONG_MATCH = 0.82

  /** Human-readable explanation of a scanned line's price, or null when there
   *  was no tax signal to report (the price is used exactly as printed). */
  function gstNoteFor(gstPct: number | null, includesGst: boolean | null): string | null {
    if (includesGst) return 'Price includes GST'
    if (gstPct !== null) return `+${gstPct}% GST added`
    return null
  }

  /** Turns an extracted bill into editable form rows.
   *
   *  Everything lands in the normal form as ordinary editable state — there is
   *  no separate "review" screen, because the manual form already is the
   *  review UI and the owner is going to check these numbers either way.
   *
   *  A confidently-matched row is pre-selected against the existing catalog
   *  item (fetched in full, since the cost-preview needs its stock/avg_cost);
   *  a weaker or absent match becomes a plain typeahead pre-filled with the
   *  bill's own wording, so the owner picks rather than the machine guessing
   *  wrong and silently merging two different parts. */
  async function applyExtraction(bill: BillExtraction) {
    if (bill.supplier_name) setSupplier(bill.supplier_name)
    if (bill.bill_date) setDate(bill.bill_date)

    const resolved = await Promise.all(
      bill.lines.map(async (l): Promise<Line> => {
        const confident = l.matched_item_id !== null && (l.match_confidence ?? 0) >= STRONG_MATCH
        const selected = confident ? await api.get<Item>(`/items/${l.matched_item_id}`).catch(() => null) : null

        return {
          key: crypto.randomUUID(),
          query: l.item_name ?? '',
          selected,
          isNew: false,
          newName: l.item_name ?? '',
          // A price or quantity the model couldn't read stays empty rather
          // than becoming 0, forcing the owner to supply it instead of
          // silently saving a wrong number.
          quantity: l.quantity !== null ? String(l.quantity) : '',
          // unit_price/total_price are already GST-adjusted server-side —
          // this is the shop's real per-unit cost, not the bare printed rate.
          price:
            l.unit_price !== null ? String(l.unit_price) : l.total_price !== null ? String(l.total_price) : '',
          priceMode: l.unit_price !== null || l.total_price === null ? 'unit' : 'total',
          gstNote: gstNoteFor(l.gst_pct, l.price_includes_gst),
        }
      }),
    )

    setLines(resolved.length > 0 ? resolved : [newLine()])
    setScanNotes(bill.warnings)
    setFromScan(true)
    setMiscCharges(bill.misc_charges)
    setError(null)
    if (resolved.length > 0) {
      toast.success(`Read ${resolved.length} item(s) — check them before saving`)
    }
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function submit() {
    setError(null)
    const payloadLines = []

    for (const [i, l] of lines.entries()) {
      const label = l.selected?.canonical_name ?? l.newName ?? `Line ${i + 1}`
      if (!l.selected && !(l.isNew && l.newName)) {
        setError(`Pick an item (or create a new one) for line ${i + 1}.`)
        return
      }
      const q = Number(l.quantity)
      if (!q || q <= 0) {
        setError(`Enter a quantity greater than zero for ${label}.`)
        return
      }
      const unit = unitPriceOf(l)
      if (unit === null || unit <= 0) {
        setError(`Enter a valid price for ${label}.`)
        return
      }
      payloadLines.push(
        l.selected
          ? { item_id: l.selected.item_id, quantity: q, unit_price: unit }
          : { new_item_name: l.newName, quantity: q, unit_price: unit },
      )
    }

    if (supplier.trim()) pushRecent('suppliers', supplier.trim())

    setBusy(true)
    try {
      const res = await api.post<PurchaseBatchResult>('/purchases', {
        supplier_name: supplier.trim() || null,
        purchase_date: date,
        lines: payloadLines,
        source: fromScan ? 'upload' : 'manual',
      })
      invalidate('/dashboard', '/insights', '/items', '/sales', '/purchases')
      setResult(res)
      toast.success(
        `Purchase saved — ${res.items_updated + res.new_items_added} item(s) updated`,
      )
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not save purchase'
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <BackHeader title="Purchase saved" fallback="/" />

        <Card className="border-good/30 bg-good-soft">
          <div className="flex items-start gap-3">
            <CheckCircle
              size={22}
              weight="duotone"
              className="mt-0.5 shrink-0 text-good-soft-ink"
              aria-hidden="true"
            />
            <div className="text-sm text-good-soft-ink">
              <p className="font-semibold">
                {result.items_updated} item(s) updated
                {result.new_items_added > 0 && `, ${result.new_items_added} newly added`}
              </p>
              <p className="mt-0.5 opacity-90">Average cost and stock levels are up to date.</p>
            </div>
          </div>
        </Card>

        <div className="space-y-2.5">
          {result.lines.map((l) => (
            <Card key={l.item_id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{l.item_name}</p>
                  {l.is_new_item && (
                    <span className="mt-1 inline-block rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand-soft-ink">
                      New item
                    </span>
                  )}
                </div>
                <div className="nums shrink-0 text-right text-sm">
                  <p className="font-semibold text-ink">{moneyPrecise(l.new_avg_cost)}</p>
                  <p className="text-xs text-ink-muted">avg cost</p>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5 text-xs text-ink-muted">
                <span className="nums">
                  Bought {qty(l.quantity)} @ {moneyPrecise(l.unit_price)}
                </span>
                <span className="nums font-medium text-ink">Stock now {qty(l.new_stock_qty)}</span>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            fullWidth
            icon={<Plus size={18} weight="bold" aria-hidden="true" />}
            onClick={() => {
              setResult(null)
              setLines([newLine()])
              setSupplier('')
              setScanNotes([])
              setFromScan(false)
              setMiscCharges([])
            }}
          >
            Add another
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
      <BackHeader title="Add Purchase" subtitle="Stock you bought from a supplier" fallback="/" />

      <BillScanner
        billType="purchase"
        onExtracted={(bill) => {
          void applyExtraction(bill)
        }}
      />

      {scanNotes.length > 0 && (
        <AlertBanner tone="warn">
          <ul className="space-y-0.5">
            {scanNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </AlertBanner>
      )}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <SupplierTypeahead
            label="Supplier"
            hint="Optional — helps you compare prices later"
            placeholder="Search or add a supplier"
            value={supplier}
            onChange={setSupplier}
          />
          <TextField
            label="Purchase date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </Card>

      <div className="space-y-3">
        {lines.map((l, idx) => {
          const unit = unitPriceOf(l)
          const preview =
            l.selected && unit
              ? previewNewAvgCost(
                  Number(l.selected.stock_qty),
                  Number(l.selected.avg_cost),
                  Number(l.quantity) || 0,
                  unit,
                )
              : null

          return (
            <Card key={l.key}>
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
                {l.selected || l.isNew ? (
                  <div>
                    <span className="mb-1.5 block text-sm font-semibold text-ink">Item</span>
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          {l.selected?.canonical_name ?? l.newName}
                        </span>
                        <span className="nums block text-xs text-ink-muted">
                          {l.selected
                            ? `In stock ${qty(l.selected.stock_qty)} ${l.selected.unit} · avg ${moneyPrecise(l.selected.avg_cost)}`
                            : 'New item — will be created'}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateLine(l.key, { selected: null, isNew: false, newName: '', query: '' })
                        }
                      >
                        Change
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ItemTypeahead
                    label="Item"
                    placeholder="Search or create an item"
                    value={l.query}
                    onChangeText={(text) => updateLine(l.key, { query: text })}
                    onSelectExisting={(item) => updateLine(l.key, { selected: item })}
                    onCreateNew={(name) => updateLine(l.key, { isNew: true, newName: name })}
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Quantity"
                    required
                    placeholder="0"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                  />
                  <NumberField
                    label={l.priceMode === 'unit' ? 'Price per unit' : 'Total price'}
                    required
                    prefix="₹"
                    placeholder="0.00"
                    value={l.price}
                    onChange={(e) => updateLine(l.key, { price: e.target.value })}
                  />
                </div>

                {/* Transparency for a scanned price: the number in the field
                    above may already be higher than the bill's printed rate
                    because GST was added — this says so rather than leaving
                    the owner to wonder where the number came from. */}
                {l.gstNote && <p className="text-xs text-ink-muted">{l.gstNote}</p>}

                <button
                  type="button"
                  onClick={() =>
                    updateLine(l.key, { priceMode: l.priceMode === 'unit' ? 'total' : 'unit' })
                  }
                  className="min-h-9 text-xs font-semibold text-brand-text underline underline-offset-2"
                >
                  {l.priceMode === 'unit'
                    ? 'Bill shows a total instead? Enter total price'
                    : 'Enter price per unit instead'}
                </button>

                {/* Showing the resulting average before committing is the whole
                    point of the app — it lets the owner catch a mistyped price
                    while it's still easy to fix. */}
                {preview !== null && (
                  <div className="flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2.5 text-sm text-brand-soft-ink">
                    <Sparkle size={16} weight="duotone" aria-hidden="true" className="shrink-0" />
                    <span className="nums">
                      New average cost will be{' '}
                      <strong className="font-semibold">{moneyPrecise(preview)}</strong>
                      {l.selected && Number(l.selected.avg_cost) > 0 && (
                        <span className="opacity-80">
                          {' '}
                          (was {moneyPrecise(l.selected.avg_cost)})
                        </span>
                      )}
                    </span>
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

      {/* Shown after the item list, once the owner has seen every line — never
          applied automatically. Packing/freight charges only fold into item
          costs if the owner explicitly says so here. */}
      {miscCharges.length > 0 && (
        <AlertBanner tone="warn">
          <div className="space-y-2">
            <div>
              <p className="font-medium">
                This bill also has {money(miscCharges.reduce((sum, c) => sum + c.amount, 0))} in extra
                charges:
              </p>
              <ul className="mt-0.5 space-y-0.5 opacity-90">
                {miscCharges.map((c, i) => (
                  <li key={i}>
                    {c.label} — {money(c.amount)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const total = miscCharges.reduce((sum, c) => sum + c.amount, 0)
                  setLines((prev) => applyMiscCharges(prev, total))
                  setMiscCharges([])
                  toast.success('Added to item costs')
                }}
              >
                Add to item costs
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMiscCharges([])}>
                Ignore
              </Button>
            </div>
          </div>
        </AlertBanner>
      )}

      {error && <AlertBanner tone="bad">{error}</AlertBanner>}

      <div className="flex gap-2.5 pt-1">
        <Button variant="secondary" fullWidth onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button fullWidth loading={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save purchase'}
        </Button>
      </div>
    </div>
  )
}
