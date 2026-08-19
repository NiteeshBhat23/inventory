export interface Shop {
  id: string
  name: string
  default_target_margin_pct: number
  default_low_stock_threshold: number
}

export interface Item {
  item_id: string
  canonical_name: string
  aliases: string[]
  unit: string
  avg_cost: number
  stock_qty: number
  selling_price: number
  target_margin_pct: number | null
  category: string | null
  low_stock_threshold: number | null
  is_archived: boolean
  wont_restock: boolean
  suggested_selling_price: number | null
  margin_pct: number | null
  is_below_cost: boolean
  is_low_stock: boolean
}

export interface PurchaseHistoryEntry {
  purchase_id: string
  item_id: string
  supplier_name: string | null
  quantity: number
  unit_price: number
  total_price: number
  purchase_date: string
  avg_cost_after: number
  source: string
  created_at: string
}

export interface PurchaseLineIn {
  item_id?: string | null
  new_item_name?: string | null
  new_item_unit?: string | null
  new_item_category?: string | null
  quantity: number
  unit_price?: number | null
  total_price?: number | null
}

export interface PurchaseLineResult {
  item_id: string
  item_name: string
  is_new_item: boolean
  quantity: number
  unit_price: number
  new_avg_cost: number
  new_stock_qty: number
}

export interface PurchaseBatchResult {
  items_updated: number
  new_items_added: number
  lines: PurchaseLineResult[]
}

export interface SaleLineIn {
  item_id: string
  quantity: number
  sale_price: number
  override_below_cost: boolean
}

export interface SaleLineResult {
  item_id: string
  item_name: string
  quantity: number
  sale_price: number
  cost_at_sale: number
  profit: number
  sold_below_cost: boolean
  blocked: boolean
  block_reason: string | null
}

export interface SaleBatchResult {
  items_sold: number
  total_revenue: number
  total_profit: number
  below_cost_count: number
  lines: SaleLineResult[]
}

export interface SaleHistoryEntry {
  sale_id: string
  item_id: string
  item_name: string
  quantity: number
  sale_price: number
  cost_at_sale: number
  revenue: number
  profit: number
  sold_below_cost: boolean
  sale_date: string
}

// ---------- Bill scanning (Phase 2) ----------

/** One row read off a bill, with the catalog match the server resolved.
 *  Every value is nullable because the model returns null rather than
 *  guessing — the form flags those as needing input instead of defaulting
 *  them to zero. */
export interface MatchedLine {
  item_name: string | null
  quantity: number | null
  unit: string | null
  // Already GST-adjusted by the backend — this is the shop's real per-unit
  // landed cost, not necessarily the rate the bill printed.
  unit_price: number | null
  total_price: number | null
  // Carried through purely so the UI can show what was applied (e.g. "+18%
  // GST added"); the adjustment itself already happened server-side.
  gst_pct: number | null
  price_includes_gst: boolean | null
  matched_item_id: string | null
  matched_item_name: string | null
  match_confidence: number | null
}

/** A bill-level charge not tied to one product row (packing, freight). Never
 *  auto-applied — see the misc-charge prompt in AddPurchase/RecordSale. */
export interface MiscCharge {
  label: string
  amount: number
}

export interface BillExtraction {
  bill_type: 'purchase' | 'sale'
  supplier_name: string | null
  customer_name: string | null
  invoice_ref: string | null
  bill_date: string | null
  lines: MatchedLine[]
  misc_charges: MiscCharge[]
  warnings: string[]
}

export interface NamedValue {
  name: string
  value: number
}

export interface PurchaseHistoryEntry {
  purchase_id: string
  item_id: string
  item_name: string
  supplier_name: string | null
  quantity: number
  unit_price: number
  total_price: number
  purchase_date: string
  created_at: string
}

export interface TrendPoint {
  date: string
  value: number
}

export interface ActivityEntry {
  type: 'purchase' | 'sale'
  item_name: string
  quantity: number
  amount: number
  date: string
}

export interface DashboardData {
  kpis: {
    inventory_value: number
    revenue: number
    profit: number
    low_stock_count: number
    below_cost_count: number
  }
  inventory_value_trend: TrendPoint[]
  top_items_by_profit: NamedValue[]
  top_items_by_volume: NamedValue[]
  category_breakdown: NamedValue[]
  supplier_spend: NamedValue[]
  low_stock_items: Item[]
  below_cost_items: Item[]
  recent_activity: ActivityEntry[]
}

// ---------- Insights (decision-support reports) ----------

export interface ProfitLeaderboardRow {
  item_id: string
  item_name: string
  units_sold: number
  revenue: number
  total_profit: number
  profit_per_unit: number
  margin_pct: number
}

export interface VelocityRow {
  item_id: string
  item_name: string
  units_sold: number
  units_per_day: number
}

export interface AgingRow {
  item_id: string
  item_name: string
  stock_qty: number
  days_since_last_sale: number | null
  bucket: string
  units_sold_in_period: number
  sell_through_pct: number | null
}

export interface SupplierPriceRow {
  item_id: string
  item_name: string
  current_avg_cost: number
  best_price: number
  best_supplier: string | null
  best_price_date: string
  supplier_count: number
  overpaying: boolean
}

export interface LowMarginRow {
  item_id: string
  item_name: string
  avg_cost: number
  selling_price: number
  margin_pct: number | null
  target_margin_pct: number
  is_below_cost: boolean
}

export interface TimingRow {
  item_id: string
  item_name: string
  avg_days_to_sell: number
  sample_size: number
}

export interface ReorderRow {
  item_id: string
  item_name: string
  stock_qty: number
  units_per_day: number
  days_of_stock_left: number | null
  suggested_reorder_qty: number
}

export interface InsightsData {
  days: number
  profit_leaderboard: ProfitLeaderboardRow[]
  velocity: VelocityRow[]
  aging: AgingRow[]
  supplier_comparison: SupplierPriceRow[]
  low_margin: LowMarginRow[]
  timing: TimingRow[]
  reorder: ReorderRow[]
}

export interface PriceHistoryPoint {
  date: string
  kind: 'cost' | 'selling'
  value: number
}

export interface PriceHistoryData {
  item_id: string
  item_name: string
  points: PriceHistoryPoint[]
}
