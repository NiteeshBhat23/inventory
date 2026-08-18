import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


# ---------- Shop ----------
class ShopCreate(BaseModel):
    name: str
    default_target_margin_pct: Decimal = Decimal(20)
    default_low_stock_threshold: Decimal = Decimal(5)


class ShopOut(BaseModel):
    # Response models use float, not Decimal: Pydantic v2 serializes Decimal
    # to a JSON *string* (to avoid float precision loss), which silently
    # breaks any frontend code calling .toFixed()/arithmetic on the value.
    # Decimal is still used internally (models, cost_engine) for correctness;
    # it only needs to become float at the API response boundary.
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    default_target_margin_pct: float
    default_low_stock_threshold: float


# ---------- Item ----------
class ItemCreate(BaseModel):
    canonical_name: str
    unit: str = "piece"
    category: str | None = None
    target_margin_pct: Decimal | None = None
    low_stock_threshold: Decimal | None = None


class ItemUpdate(BaseModel):
    canonical_name: str | None = None
    unit: str | None = None
    category: str | None = None
    selling_price: Decimal | None = None
    target_margin_pct: Decimal | None = None
    low_stock_threshold: Decimal | None = None
    is_archived: bool | None = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    item_id: uuid.UUID
    canonical_name: str
    aliases: list[str]
    unit: str
    avg_cost: float
    stock_qty: float
    selling_price: float
    target_margin_pct: float | None
    category: str | None
    low_stock_threshold: float | None
    is_archived: bool
    suggested_selling_price: float | None = None
    margin_pct: float | None = None
    is_below_cost: bool = False
    is_low_stock: bool = False


class ItemMergeRequest(BaseModel):
    source_item_id: uuid.UUID
    target_item_id: uuid.UUID


# ---------- Purchases ----------
class PurchaseLineIn(BaseModel):
    item_id: uuid.UUID | None = None  # None => create new item
    new_item_name: str | None = None
    new_item_unit: str | None = "piece"
    new_item_category: str | None = None
    quantity: Decimal
    unit_price: Decimal | None = None
    total_price: Decimal | None = None


class PurchaseBatchIn(BaseModel):
    supplier_name: str | None = None
    purchase_date: date
    lines: list[PurchaseLineIn]


class PurchaseLineResult(BaseModel):
    item_id: uuid.UUID
    item_name: str
    is_new_item: bool
    quantity: float
    unit_price: float
    new_avg_cost: float
    new_stock_qty: float


class PurchaseBatchResult(BaseModel):
    items_updated: int
    new_items_added: int
    lines: list[PurchaseLineResult]


class PurchaseHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    purchase_id: uuid.UUID
    item_id: uuid.UUID
    supplier_name: str | None
    quantity: float
    unit_price: float
    total_price: float
    purchase_date: date
    avg_cost_after: float
    source: str
    created_at: datetime


class PurchaseHistoryEntry(BaseModel):
    """One line-level purchase record with the item name resolved — the
    purchase-side counterpart to SaleHistoryEntry. Powers the "Spend by
    supplier" drill-down: every purchase that rolled into a supplier's total,
    not just the rolled-up number."""

    purchase_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    supplier_name: str | None
    quantity: float
    unit_price: float
    total_price: float
    purchase_date: date
    created_at: datetime


# ---------- Sales ----------
class SaleLineIn(BaseModel):
    item_id: uuid.UUID
    quantity: Decimal
    sale_price: Decimal
    override_below_cost: bool = False


class SaleBatchIn(BaseModel):
    lines: list[SaleLineIn]


class SaleLineResult(BaseModel):
    item_id: uuid.UUID
    item_name: str
    quantity: float
    sale_price: float
    cost_at_sale: float
    profit: float
    sold_below_cost: bool
    blocked: bool = False
    block_reason: str | None = None


class SaleBatchResult(BaseModel):
    items_sold: int
    total_revenue: float
    total_profit: float
    below_cost_count: int
    lines: list[SaleLineResult]


class SaleRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    sale_id: uuid.UUID
    item_id: uuid.UUID
    quantity: float
    sale_price: float
    cost_at_sale: float
    profit: float
    source: str
    sold_below_cost: bool
    sale_date: datetime


class SaleHistoryEntry(BaseModel):
    """One line-level sale record with the item name resolved — this is what
    powers the Profit/Revenue drill-down screens: every transaction that rolled
    up into those dashboard totals, so the owner can see exactly where the
    number came from rather than trusting a single aggregate figure."""

    sale_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    quantity: float
    sale_price: float
    cost_at_sale: float
    revenue: float
    profit: float
    sold_below_cost: bool
    sale_date: datetime


# ---------- Dashboard / Analytics ----------
class KpiSummary(BaseModel):
    inventory_value: float
    revenue: float
    profit: float
    low_stock_count: int
    below_cost_count: int


class TrendPoint(BaseModel):
    date: date
    value: float


class NamedValue(BaseModel):
    name: str
    value: float


class ActivityEntry(BaseModel):
    type: str  # 'purchase' | 'sale'
    item_name: str
    quantity: float
    amount: float
    date: datetime


class DashboardOut(BaseModel):
    kpis: KpiSummary
    inventory_value_trend: list[TrendPoint]
    top_items_by_profit: list[NamedValue]
    top_items_by_volume: list[NamedValue]
    category_breakdown: list[NamedValue]
    supplier_spend: list[NamedValue]
    low_stock_items: list[ItemOut]
    below_cost_items: list[ItemOut]
    recent_activity: list[ActivityEntry]


# ---------- Insights (replaces the old CSV reports) ----------
class ProfitLeaderboardRow(BaseModel):
    item_id: uuid.UUID
    item_name: str
    units_sold: float
    revenue: float
    total_profit: float
    profit_per_unit: float
    margin_pct: float


class VelocityRow(BaseModel):
    item_id: uuid.UUID
    item_name: str
    units_sold: float
    units_per_day: float


class AgingRow(BaseModel):
    """One row per item currently in stock, oldest-unsold first.

    bucket groups by days since the item's last sale using the standard
    retail convention (0-30 / 31-60 / 61-90 / 90+ / never sold). sell_through_pct
    keeps a slow-but-steady seller from reading the same as one that's truly
    dead: it's units sold in the period over (units sold + what's still on
    the shelf), so a high number here softens an old last-sale date."""

    item_id: uuid.UUID
    item_name: str
    stock_qty: float
    days_since_last_sale: int | None
    bucket: str
    units_sold_in_period: float
    sell_through_pct: float | None


class SupplierPriceRow(BaseModel):
    item_id: uuid.UUID
    item_name: str
    current_avg_cost: float
    best_price: float
    best_supplier: str | None
    best_price_date: date
    supplier_count: int
    overpaying: bool  # current avg cost is above the best price ever recorded


class LowMarginRow(BaseModel):
    item_id: uuid.UUID
    item_name: str
    avg_cost: float
    selling_price: float
    margin_pct: float | None
    target_margin_pct: float
    is_below_cost: bool


class TimingRow(BaseModel):
    item_id: uuid.UUID
    item_name: str
    avg_days_to_sell: float
    sample_size: int


class ReorderRow(BaseModel):
    item_id: uuid.UUID
    item_name: str
    stock_qty: float
    units_per_day: float
    days_of_stock_left: float | None
    suggested_reorder_qty: float


class PriceHistoryPoint(BaseModel):
    date: date
    kind: str  # 'cost' | 'selling'
    value: float


class PriceHistoryOut(BaseModel):
    item_id: uuid.UUID
    item_name: str
    points: list[PriceHistoryPoint]


class InsightsOut(BaseModel):
    days: int
    profit_leaderboard: list[ProfitLeaderboardRow]
    velocity: list[VelocityRow]
    aging: list[AgingRow]
    supplier_comparison: list[SupplierPriceRow]
    low_margin: list[LowMarginRow]
    timing: list[TimingRow]
    reorder: list[ReorderRow]
