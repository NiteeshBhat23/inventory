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

export interface NamedValue {
  name: string
  value: number
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
