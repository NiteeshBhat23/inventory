from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..deps import ShopContext
from ..schemas import PurchaseBatchIn, PurchaseBatchResult, PurchaseHistoryEntry, PurchaseLineResult
from . import items as items_service
from .cost_engine import InvalidPurchaseError, compute_new_avg_cost, derive_unit_price


def commit_purchase_batch(db: Session, shop: ShopContext, batch: PurchaseBatchIn) -> PurchaseBatchResult:
    """Commits every line in one DB transaction — item + stock + history all
    update together or not at all (PRD Section 10 data-integrity requirement)."""
    results: list[PurchaseLineResult] = []
    new_items = 0

    try:
        for line in batch.lines:
            if line.quantity is None or line.quantity <= 0:
                raise InvalidPurchaseError(f"Quantity must be positive for line: {line.new_item_name or line.item_id}")

            unit_price = derive_unit_price(line.quantity, line.total_price, line.unit_price)
            total_price = line.total_price if line.total_price is not None else unit_price * line.quantity

            if line.item_id:
                item = items_service.get_item(db, shop, line.item_id)
                if not item:
                    raise InvalidPurchaseError(f"Item {line.item_id} not found")
                is_new = False
            else:
                if not line.new_item_name:
                    raise InvalidPurchaseError("new_item_name is required when item_id is not provided")
                # Reuses an existing item if this name (normalized) already
                # matches one — a typed or scanned name that only differs by
                # case/spacing must land on the same catalog row, not fork a
                # second one with its own separate cost/stock history.
                item, is_new = items_service.get_or_create_item(
                    db, shop, line.new_item_name, line.new_item_unit or "piece", line.new_item_category
                )
                if is_new:
                    new_items += 1

            cost_result = compute_new_avg_cost(
                Decimal(item.stock_qty), Decimal(item.avg_cost), Decimal(line.quantity), unit_price
            )
            item.avg_cost = cost_result.new_avg_cost
            item.stock_qty = cost_result.new_stock_qty
            # A purchase is itself the "I'm restocking this" decision, so any
            # earlier "won't restock" dismissal no longer applies — otherwise
            # the item stays hidden from low-stock alerts even after the
            # owner has visibly acted on it.
            item.wont_restock = False
            if not item.selling_price:
                old_selling_price = item.selling_price
                margin = item.target_margin_pct if item.target_margin_pct is not None else shop.default_target_margin_pct
                item.selling_price = cost_result.new_avg_cost * (Decimal(1) + Decimal(margin) / Decimal(100))
                items_service.log_price_change(
                    db, shop, item, old_selling_price, item.selling_price, source="auto_on_purchase"
                )

            history = models.PurchaseHistory(
                item_id=item.item_id,
                shop_id=shop.id,
                supplier_name=batch.supplier_name,
                quantity=line.quantity,
                unit_price=unit_price,
                total_price=total_price,
                purchase_date=batch.purchase_date,
                avg_cost_after=cost_result.new_avg_cost,
                source=batch.source,
            )
            db.add(history)

            results.append(
                PurchaseLineResult(
                    item_id=item.item_id,
                    item_name=item.canonical_name,
                    is_new_item=is_new,
                    quantity=line.quantity,
                    unit_price=unit_price,
                    new_avg_cost=cost_result.new_avg_cost,
                    new_stock_qty=cost_result.new_stock_qty,
                )
            )

        db.commit()
    except Exception:
        db.rollback()
        raise

    return PurchaseBatchResult(
        items_updated=len(results) - new_items,
        new_items_added=new_items,
        lines=results,
    )


def list_purchase_history(
    db: Session, shop: ShopContext, days: int = 90, supplier: str | None = None
) -> list[PurchaseHistoryEntry]:
    """Line-level purchase history, newest first, with item names resolved —
    powers the "Spend by supplier" drill-down: every purchase underneath that
    dashboard total, not just the rolled-up number."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    query = (
        db.query(models.PurchaseHistory, models.Item.canonical_name)
        .join(models.Item, models.Item.item_id == models.PurchaseHistory.item_id)
        .filter(models.PurchaseHistory.shop_id == shop.id, models.PurchaseHistory.created_at >= since)
    )
    if supplier is not None:
        # "Unknown supplier" on the dashboard stands in for a NULL supplier_name —
        # match that case explicitly rather than an impossible string equality.
        if supplier == "Unknown supplier":
            query = query.filter(models.PurchaseHistory.supplier_name.is_(None))
        else:
            query = query.filter(models.PurchaseHistory.supplier_name == supplier)
    rows = query.order_by(models.PurchaseHistory.created_at.desc()).all()
    return [
        PurchaseHistoryEntry(
            purchase_id=p.purchase_id,
            item_id=p.item_id,
            item_name=item_name,
            supplier_name=p.supplier_name,
            quantity=p.quantity,
            unit_price=p.unit_price,
            total_price=p.total_price,
            purchase_date=p.purchase_date,
            created_at=p.created_at,
        )
        for p, item_name in rows
    ]


def list_suppliers(db: Session, shop: ShopContext, search: str | None, limit: int = 20) -> list[str]:
    """Distinct supplier names this shop has actually bought from, most
    recently-used first — backs the supplier typeahead (search-as-you-type
    plus "recently used" before the owner has typed anything), the same
    pattern as the item picker. Never lists every supplier at once."""
    q = (
        db.query(
            models.PurchaseHistory.supplier_name,
            func.max(models.PurchaseHistory.created_at).label("last_used"),
        )
        .filter(
            models.PurchaseHistory.shop_id == shop.id,
            models.PurchaseHistory.supplier_name.isnot(None),
            models.PurchaseHistory.supplier_name != "",
        )
        .group_by(models.PurchaseHistory.supplier_name)
    )
    if search:
        q = q.filter(models.PurchaseHistory.supplier_name.ilike(f"%{search}%"))
    rows = q.order_by(func.max(models.PurchaseHistory.created_at).desc()).limit(limit).all()
    return [r.supplier_name for r in rows]
