import uuid
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models
from ..deps import ShopContext
from ..schemas import ItemMergeRequest, ItemOut, ItemUpdate
from .cost_engine import compute_suggested_selling_price, is_below_cost


def _to_item_out(item: models.Item, shop: ShopContext) -> ItemOut:
    margin_pct = item.target_margin_pct if item.target_margin_pct is not None else shop.default_target_margin_pct
    suggested = compute_suggested_selling_price(Decimal(item.avg_cost), Decimal(margin_pct)) if item.avg_cost else None
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
        margin_pct=margin_pct,
        is_below_cost=bool(item.selling_price) and is_below_cost(Decimal(item.selling_price), Decimal(item.avg_cost)),
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
    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
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
