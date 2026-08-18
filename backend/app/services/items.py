import uuid
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models
from ..deps import ShopContext
from ..schemas import ItemMergeRequest, ItemOut, ItemUpdate
from .cost_engine import compute_suggested_selling_price, is_below_cost


def log_price_change(
    db: Session,
    shop: ShopContext,
    item: models.Item,
    old_price,
    new_price,
    source: str = "manual",
) -> None:
    """Records a selling-price change for the Insights price-history chart.
    A no-op when the price didn't actually move, so re-saving an item with an
    unchanged price doesn't pollute the trend with a flat point."""
    old_decimal = Decimal(old_price) if old_price is not None else None
    new_decimal = Decimal(new_price)
    if old_decimal == new_decimal:
        return
    db.add(
        models.SellingPriceHistory(
            item_id=item.item_id,
            shop_id=shop.id,
            old_price=old_price,
            new_price=new_price,
            source=source,
        )
    )


def _to_item_out(item: models.Item, shop: ShopContext) -> ItemOut:
    # target_margin is what the item WOULD sell at (used only to suggest a
    # selling price for a brand-new item that doesn't have one yet).
    target_margin = item.target_margin_pct if item.target_margin_pct is not None else shop.default_target_margin_pct
    suggested = compute_suggested_selling_price(Decimal(item.avg_cost), Decimal(target_margin)) if item.avg_cost else None

    # actual_margin_pct is what the item IS selling at right now, from its
    # real selling_price and avg_cost — the number the UI shows next to the
    # price everywhere (Inventory list, item detail, "best margin" sort).
    # These two used to be conflated under one field: every item showed the
    # shop's 20% *default target* instead of its own realized margin, so an
    # item selling at a 50% margin still displayed "20% margin".
    selling_price = Decimal(item.selling_price)
    avg_cost = Decimal(item.avg_cost)
    # Margin = profit relative to what it cost you, not to what it sold for.
    # Buy at 150, sell at 300 → 150 profit on a 150 cost = 100% margin.
    actual_margin_pct = float((selling_price - avg_cost) / avg_cost * 100) if avg_cost > 0 else None

    threshold = item.low_stock_threshold if item.low_stock_threshold is not None else shop.default_low_stock_threshold
    return ItemOut(
        item_id=item.item_id,
        canonical_name=item.canonical_name,
        aliases=item.aliases or [],
        unit=item.unit,
        avg_cost=item.avg_cost,
        stock_qty=item.stock_qty,
        selling_price=item.selling_price,
        target_margin_pct=item.target_margin_pct,
        category=item.category,
        low_stock_threshold=item.low_stock_threshold,
        is_archived=item.is_archived,
        suggested_selling_price=suggested,
        margin_pct=actual_margin_pct,
        is_below_cost=bool(item.selling_price) and is_below_cost(selling_price, avg_cost),
        is_low_stock=Decimal(item.stock_qty) <= Decimal(threshold),
    )


def list_items(db: Session, shop: ShopContext, search: str | None, category: str | None) -> list[ItemOut]:
    q = db.query(models.Item).filter(models.Item.shop_id == shop.id, models.Item.is_archived.is_(False))
    if search:
        like = f"%{search}%"
        q = q.filter(or_(models.Item.canonical_name.ilike(like), models.Item.aliases.any(search)))
    if category:
        q = q.filter(models.Item.category == category)
    items = q.order_by(models.Item.canonical_name).all()
    return [_to_item_out(i, shop) for i in items]


def get_item(db: Session, shop: ShopContext, item_id: uuid.UUID) -> models.Item | None:
    return (
        db.query(models.Item)
        .filter(models.Item.item_id == item_id, models.Item.shop_id == shop.id)
        .first()
    )


def create_item(db: Session, shop: ShopContext, name: str, unit: str = "piece", category: str | None = None) -> models.Item:
    item = models.Item(shop_id=shop.id, canonical_name=name, unit=unit, category=category)
    db.add(item)
    db.flush()
    return item


def update_item(db: Session, shop: ShopContext, item_id: uuid.UUID, patch: ItemUpdate) -> models.Item | None:
    item = get_item(db, shop, item_id)
    if not item:
        return None
    old_selling_price = item.selling_price
    changes = patch.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(item, field, value)
    if "selling_price" in changes:
        log_price_change(db, shop, item, old_selling_price, item.selling_price, source="manual")
    db.flush()
    return item


def merge_items(db: Session, shop: ShopContext, req: ItemMergeRequest) -> models.Item | None:
    """Merges source item into target: aliases the source name onto the target,
    re-points purchase/sale history, combines stock (weighted-average of the
    two avg costs), then archives the source item."""
    source = get_item(db, shop, req.source_item_id)
    target = get_item(db, shop, req.target_item_id)
    if not source or not target:
        return None

    combined_qty = Decimal(source.stock_qty) + Decimal(target.stock_qty)
    if combined_qty > 0:
        combined_value = Decimal(source.stock_qty) * Decimal(source.avg_cost) + Decimal(target.stock_qty) * Decimal(target.avg_cost)
        target.avg_cost = combined_value / combined_qty
    target.stock_qty = combined_qty
    target.aliases = list(set((target.aliases or []) + (source.aliases or []) + [source.canonical_name]))

    db.query(models.PurchaseHistory).filter(models.PurchaseHistory.item_id == source.item_id).update(
        {"item_id": target.item_id}
    )
    db.query(models.SaleRecord).filter(models.SaleRecord.item_id == source.item_id).update(
        {"item_id": target.item_id}
    )
    source.is_archived = True
    source.stock_qty = 0
    db.flush()
    return target


def to_item_out(item: models.Item, shop: ShopContext) -> ItemOut:
    return _to_item_out(item, shop)
