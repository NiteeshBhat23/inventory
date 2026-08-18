from decimal import Decimal

from sqlalchemy.orm import Session

from .. import models
from ..schemas import PurchaseBatchIn, PurchaseBatchResult, PurchaseLineResult
from . import items as items_service
from .cost_engine import InvalidPurchaseError, compute_new_avg_cost, derive_unit_price


def commit_purchase_batch(db: Session, shop: models.Shop, batch: PurchaseBatchIn) -> PurchaseBatchResult:
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
                item = items_service.create_item(
                    db, shop, line.new_item_name, line.new_item_unit or "piece", line.new_item_category
                )
                is_new = True
                new_items += 1

            cost_result = compute_new_avg_cost(
                Decimal(item.stock_qty), Decimal(item.avg_cost), Decimal(line.quantity), unit_price
            )
            item.avg_cost = cost_result.new_avg_cost
            item.stock_qty = cost_result.new_stock_qty
            if not item.selling_price:
                margin = item.target_margin_pct if item.target_margin_pct is not None else shop.default_target_margin_pct
                item.selling_price = cost_result.new_avg_cost * (Decimal(1) + Decimal(margin) / Decimal(100))

            history = models.PurchaseHistory(
                item_id=item.item_id,
                shop_id=shop.id,
                supplier_name=batch.supplier_name,
                quantity=line.quantity,
                unit_price=unit_price,
                total_price=total_price,
                purchase_date=batch.purchase_date,
                avg_cost_after=cost_result.new_avg_cost,
                source="manual",
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
