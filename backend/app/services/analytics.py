"""Dashboard aggregates. Per the System Design doc, this is Phase 1's new
Analytics/Reporting service — read-heavy, cached in-process per shop by the
router layer, invalidated on purchase/sale commit."""

import time
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..schemas import ActivityEntry, DashboardOut, KpiSummary, NamedValue, TrendPoint
from .items import to_item_out

_CACHE: dict[str, tuple[float, DashboardOut]] = {}
_CACHE_TTL_SECONDS = 30


def invalidate_dashboard_cache(shop_id) -> None:
    _CACHE.pop(str(shop_id), None)


def build_dashboard(db: Session, shop: models.Shop, days: int = 30) -> DashboardOut:
    cache_key = f"{shop.id}:{days}"
    cached = _CACHE.get(cache_key)
    if cached and (time.time() - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    since = datetime.utcnow() - timedelta(days=days)

    items = db.query(models.Item).filter(models.Item.shop_id == shop.id, models.Item.is_archived.is_(False)).all()
    inventory_value = sum((Decimal(i.stock_qty) * Decimal(i.avg_cost) for i in items), Decimal(0))

    sales = (
        db.query(models.SaleRecord)
        .filter(models.SaleRecord.shop_id == shop.id, models.SaleRecord.sale_date >= since)
        .all()
    )
    revenue = sum((Decimal(s.quantity) * Decimal(s.sale_price) for s in sales), Decimal(0))
    profit = sum((Decimal(s.profit) for s in sales), Decimal(0))

    item_out_list = [to_item_out(i, shop) for i in items]
    low_stock_items = [i for i in item_out_list if i.is_low_stock]
    below_cost_items = [i for i in item_out_list if i.is_below_cost]

    # Inventory value trend: reconstruct running stock value at each purchase/sale
    # event over the window, day-bucketed. Simple and good enough at Phase 1 volume.
    events = []
    purchases = (
        db.query(models.PurchaseHistory)
        .filter(models.PurchaseHistory.shop_id == shop.id, models.PurchaseHistory.created_at >= since)
        .all()
    )
    for p in purchases:
        events.append((p.created_at.date(), Decimal(p.quantity) * Decimal(p.avg_cost_after)))
    trend_by_day: dict[date, Decimal] = {}
    running = inventory_value
    for d in sorted({e[0] for e in events}, reverse=True):
        trend_by_day[d] = running
    inventory_value_trend = sorted(
        (TrendPoint(date=d, value=v) for d, v in trend_by_day.items()), key=lambda t: t.date
    )
    if not inventory_value_trend:
        inventory_value_trend = [TrendPoint(date=datetime.utcnow().date(), value=inventory_value)]

    item_name_by_id = {i.item_id: i.canonical_name for i in items}
    profit_by_item: dict[str, Decimal] = {}
    volume_by_item: dict[str, Decimal] = {}
    for s in sales:
        name = item_name_by_id.get(s.item_id, "Unknown")
        profit_by_item[name] = profit_by_item.get(name, Decimal(0)) + Decimal(s.profit)
        volume_by_item[name] = volume_by_item.get(name, Decimal(0)) + Decimal(s.quantity)

    top_items_by_profit = sorted(
        (NamedValue(name=k, value=v) for k, v in profit_by_item.items()), key=lambda x: x.value, reverse=True
    )[:8]
    top_items_by_volume = sorted(
        (NamedValue(name=k, value=v) for k, v in volume_by_item.items()), key=lambda x: x.value, reverse=True
    )[:8]

    category_value: dict[str, Decimal] = {}
    for i in items:
        cat = i.category or "Uncategorized"
        category_value[cat] = category_value.get(cat, Decimal(0)) + Decimal(i.stock_qty) * Decimal(i.avg_cost)
    category_breakdown = sorted(
        (NamedValue(name=k, value=v) for k, v in category_value.items()), key=lambda x: x.value, reverse=True
    )

    supplier_spend_rows = (
        db.query(models.PurchaseHistory.supplier_name, func.sum(models.PurchaseHistory.total_price))
        .filter(models.PurchaseHistory.shop_id == shop.id, models.PurchaseHistory.created_at >= since)
        .group_by(models.PurchaseHistory.supplier_name)
        .all()
    )
    supplier_spend = sorted(
        (NamedValue(name=name or "Unknown supplier", value=Decimal(total)) for name, total in supplier_spend_rows),
        key=lambda x: x.value,
        reverse=True,
    )

    activity: list[ActivityEntry] = []
    for p in sorted(purchases, key=lambda x: x.created_at, reverse=True)[:10]:
        activity.append(
            ActivityEntry(
                type="purchase",
                item_name=item_name_by_id.get(p.item_id, "Unknown"),
                quantity=p.quantity,
                amount=p.total_price,
                date=p.created_at,
            )
        )
    for s in sorted(sales, key=lambda x: x.sale_date, reverse=True)[:10]:
        activity.append(
            ActivityEntry(
                type="sale",
                item_name=item_name_by_id.get(s.item_id, "Unknown"),
                quantity=s.quantity,
                amount=Decimal(s.quantity) * Decimal(s.sale_price),
                date=s.sale_date,
            )
        )
    activity.sort(key=lambda a: a.date, reverse=True)
    activity = activity[:15]

    dashboard = DashboardOut(
        kpis=KpiSummary(
            inventory_value=inventory_value,
            revenue=revenue,
            profit=profit,
            low_stock_count=len(low_stock_items),
            below_cost_count=len(below_cost_items),
        ),
        inventory_value_trend=inventory_value_trend,
        top_items_by_profit=top_items_by_profit,
        top_items_by_volume=top_items_by_volume,
        category_breakdown=category_breakdown,
        supplier_spend=supplier_spend,
        low_stock_items=low_stock_items,
        below_cost_items=below_cost_items,
        recent_activity=activity,
    )
    _CACHE[cache_key] = (time.time(), dashboard)
    return dashboard
