import uuid
from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class Shop(Base):
    """One row per Supabase-authenticated owner. shop.id == auth.users.id,
    so no separate account/shop mapping table is needed for Phase 1's
    single-owner-per-shop model."""

    __tablename__ = "shops"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    default_target_margin_pct: Mapped[float] = mapped_column(Numeric, default=20)
    default_low_stock_threshold: Mapped[float] = mapped_column(Numeric, default=5)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["Item"]] = relationship(back_populates="shop", cascade="all, delete-orphan")


class Item(Base):
    __tablename__ = "items"

    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False, index=True)
    canonical_name: Mapped[str] = mapped_column(String, nullable=False)
    aliases: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    unit: Mapped[str] = mapped_column(String, default="piece")
    avg_cost: Mapped[float] = mapped_column(Numeric, default=0)
    stock_qty: Mapped[float] = mapped_column(Numeric, default=0)
    selling_price: Mapped[float] = mapped_column(Numeric, default=0)
    target_margin_pct: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    low_stock_threshold: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    shop: Mapped["Shop"] = relationship(back_populates="items")
    purchases: Mapped[list["PurchaseHistory"]] = relationship(back_populates="item", cascade="all, delete-orphan")
    sales: Mapped[list["SaleRecord"]] = relationship(back_populates="item", cascade="all, delete-orphan")


class PurchaseHistory(Base):
    __tablename__ = "purchase_history"

    purchase_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("items.item_id"), nullable=False, index=True)
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False, index=True)
    supplier_name: Mapped[str | None] = mapped_column(String, nullable=True)
    quantity: Mapped[float] = mapped_column(Numeric, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric, nullable=False)
    total_price: Mapped[float] = mapped_column(Numeric, nullable=False)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    avg_cost_after: Mapped[float] = mapped_column(Numeric, nullable=False)
    source: Mapped[str] = mapped_column(String, default="manual")  # 'manual' | 'upload' (Phase 2)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    item: Mapped["Item"] = relationship(back_populates="purchases")


class SaleRecord(Base):
    __tablename__ = "sale_records"

    sale_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("items.item_id"), nullable=False, index=True)
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Numeric, nullable=False)
    sale_price: Mapped[float] = mapped_column(Numeric, nullable=False)
    cost_at_sale: Mapped[float] = mapped_column(Numeric, nullable=False)
    profit: Mapped[float] = mapped_column(Numeric, nullable=False)
    source: Mapped[str] = mapped_column(String, default="manual")  # 'manual' | 'upload' (Phase 2)
    sold_below_cost: Mapped[bool] = mapped_column(Boolean, default=False)
    customer_name: Mapped[str | None] = mapped_column(String, nullable=True)
    invoice_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    sale_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    item: Mapped["Item"] = relationship(back_populates="sales")


class SellingPriceHistory(Base):
    """Selling-price change log.

    Cost history needs no separate table — every purchase already records
    avg_cost_after with a date, so the cost trend is just a query over
    purchase_history. Selling price has no such trail: items.selling_price is
    only ever the *current* value, so a chart of "what did I charge over
    time" is impossible without logging every change as it happens. This
    table starts that log from today forward; changes before this feature
    shipped were never captured and can't be reconstructed."""

    __tablename__ = "selling_price_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("items.item_id"), nullable=False, index=True)
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False, index=True)
    old_price: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    new_price: Mapped[float] = mapped_column(Numeric, nullable=False)
    source: Mapped[str] = mapped_column(String, default="manual")  # 'manual' | 'auto_on_purchase'
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
