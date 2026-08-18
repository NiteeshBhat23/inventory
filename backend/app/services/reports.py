import csv
import io
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .. import models
from ..deps import ShopContext


def purchase_history_csv(db: Session, shop: ShopContext, days: int = 90) -> str:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(models.PurchaseHistory, models.Item.canonical_name)
        .join(models.Item, models.Item.item_id == models.PurchaseHistory.item_id)
        .filter(models.PurchaseHistory.shop_id == shop.id, models.PurchaseHistory.created_at >= since)
        .order_by(models.PurchaseHistory.purchase_date.desc())
        .all()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "item", "supplier", "quantity", "unit_price", "total_price", "avg_cost_after"])
    for p, item_name in rows:
        writer.writerow([p.purchase_date, item_name, p.supplier_name or "", p.quantity, p.unit_price, p.total_price, p.avg_cost_after])
    return buf.getvalue()


def sale_history_csv(db: Session, shop: ShopContext, days: int = 90) -> str:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(models.SaleRecord, models.Item.canonical_name)
        .join(models.Item, models.Item.item_id == models.SaleRecord.item_id)
        .filter(models.SaleRecord.shop_id == shop.id, models.SaleRecord.sale_date >= since)
        .order_by(models.SaleRecord.sale_date.desc())
        .all()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "item", "quantity", "sale_price", "cost_at_sale", "profit", "sold_below_cost"])
    for s, item_name in rows:
        writer.writerow([s.sale_date, item_name, s.quantity, s.sale_price, s.cost_at_sale, s.profit, s.sold_below_cost])
    return buf.getvalue()
