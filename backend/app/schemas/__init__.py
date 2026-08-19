import uuid
from datetime import date, datetime
from decimal import Decimal

from typing import Literal

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
    wont_restock: bool | None = None


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
    wont_restock: bool = False
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
    # 'manual' | 'upload' — records how the entry originated so the accuracy
    # of scanned bills can be measured against typed ones (PRD success
    # metrics). Defaults to manual so existing clients are unaffected.
    source: Literal["manual", "upload"] = "manual"


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
    customer_name: str | None = None
    invoice_ref: str | None = None
    source: Literal["manual", "upload"] = "manual"


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


# ---------- Bill scanning (Phase 2) ----------
# Two layers on purpose:
#   *Extracted* models are the raw shape we ask Gemini for. Every field is
#   optional, because the whole point is that the model returns null rather
#   than guessing, and the confirmation UI flags those as "needs your input".
#   *Out* models are what the frontend receives — the extracted data plus the
#   catalog match we resolved for each line.


class ExtractedLine(BaseModel):
    """One line item as read off the bill, before any matching.

    unit_price/total_price are whatever the bill's Rate/Amount columns show —
    they are NOT necessarily the shop's true landed cost, because Indian
    supplier bills routinely print a pre-tax rate with GST% as a separate
    column (see gst_pct/price_includes_gst below). extraction.py resolves
    that into a tax-inclusive cost before this ever reaches the frontend."""

    item_name: str | None = None
    quantity: float | None = None
    unit: str | None = None
    unit_price: float | None = None
    total_price: float | None = None
    # GST rate printed against this line (e.g. 18 for "18%"), if any. Bills
    # commonly vary this per row — a spark plug at 5% and a filter at 18% on
    # the same invoice — so this is read per line, not once for the bill.
    gst_pct: float | None = None
    # True: the rate/amount above already has GST baked in (bill says
    # "inclusive of tax", or shows no separate tax column at all and the
    # model judges the price already final). False: GST is added on top —
    # the common case with a printed GST% column. Null: couldn't tell, so no
    # tax adjustment is applied and the price is used exactly as printed.
    price_includes_gst: bool | None = None


class MiscCharge(BaseModel):
    """A bill-level extra charge that isn't tied to one product row —
    packing & forwarding, freight, loading. Deliberately excludes tax
    summary rows (Output CGST/SGST) and rounding, which are not owner
    decisions to make. Kept separate from line items because whether to
    fold this into item costs is the owner's call, not an automatic one —
    see BillExtractionOut.misc_charges."""

    label: str
    amount: float


class ExtractedBill(BaseModel):
    """Raw model output. Purchase bills fill supplier_name; sales invoices
    fill customer_name/invoice_ref. One shared shape keeps the vision call,
    retry and parsing logic identical for both bill types (PRD Section 9)."""

    supplier_name: str | None = None
    customer_name: str | None = None
    invoice_ref: str | None = None
    bill_date: date | None = None
    line_items: list[ExtractedLine] = []
    misc_charges: list[MiscCharge] = []


class MatchedLine(BaseModel):
    """An extracted line with the shop's catalog consulted.

    unit_price/total_price here are already GST-adjusted by extraction.py —
    this is the number the purchase/sale form should use as the real per-unit
    cost, not a value the frontend needs to gross up itself. gst_pct/
    price_includes_gst are carried through purely so the UI can show the
    owner what was applied ("+18% GST added") rather than silently changing
    the number the bill printed.

    match_confidence is the fuzzy-similarity score (0-1) behind the suggested
    item. The UI shows a low-confidence match as a suggestion the owner must
    confirm, so a wrong guess is always visible and correctable before it
    reaches the cost engine."""

    item_name: str | None = None
    quantity: float | None = None
    unit: str | None = None
    unit_price: float | None = None
    total_price: float | None = None
    gst_pct: float | None = None
    price_includes_gst: bool | None = None
    matched_item_id: uuid.UUID | None = None
    matched_item_name: str | None = None
    match_confidence: float | None = None


class BillExtractionOut(BaseModel):
    """What POST /bills/extract returns.

    `warnings` carries non-fatal problems the owner should see (a line with no
    readable price, a date we couldn't parse). A partially-read bill is still
    useful — it beats typing the whole thing — so these never fail the request.

    `misc_charges` is returned but never auto-applied: the frontend shows it
    as a prompt ("this bill also has ₹99 in Packing & Forwarding — add it to
    item costs?") and only prorates it across lines if the owner says yes."""

    bill_type: str  # 'purchase' | 'sale'
    supplier_name: str | None = None
    customer_name: str | None = None
    invoice_ref: str | None = None
    bill_date: date | None = None
    lines: list[MatchedLine] = []
    misc_charges: list[MiscCharge] = []
    warnings: list[str] = []


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
