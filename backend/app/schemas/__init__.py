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
