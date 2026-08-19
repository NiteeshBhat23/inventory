"""Dashboard aggregates. Per the System Design doc, this is Phase 1's new
Analytics/Reporting service — read-heavy, cached in-process per shop, and
invalidated on purchase/sale commit.

Performance note: this used to issue six sequential round trips and pull every
item, sale and purchase row into Python to aggregate them in a loop. Against a
Supabase instance one region away that cost ~1s of pure latency on the app's
landing page. It is now a single round trip: all six result sets are computed
server-side in one statement and returned as one JSON document, so the cost is
one network hop regardless of how much history the shop has accumulated.
"""

import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..deps import ShopContext
from ..schemas import ActivityEntry, DashboardOut, KpiSummary, NamedValue, TrendPoint
from .items import to_item_out

_CACHE: dict[str, tuple[float, DashboardOut]] = {}
_CACHE_TTL_SECONDS = 30


def invalidate_dashboard_cache(shop_id) -> None:
    """Drops every cached window (7/30/90 day) for this shop — a new purchase
    or sale moves all of them, not just the one that happens to be on screen."""
    prefix = f"{shop_id}:"
    for key in [k for k in _CACHE if k.startswith(prefix)]:
        _CACHE.pop(key, None)


# One statement, one round trip. Numerics are cast to text so they survive the
# JSON hop as exact decimal strings — going through a JSON float would quietly
# introduce binary-float error into money arithmetic.
_DASHBOARD_SQL = text(
    """
WITH live_items AS (
    SELECT item_id, canonical_name, aliases, unit,
           avg_cost::text          AS avg_cost,
           stock_qty::text         AS stock_qty,
           selling_price::text     AS selling_price,
           target_margin_pct::text AS target_margin_pct,
           category,
           low_stock_threshold::text AS low_stock_threshold,
           is_archived,
           wont_restock
    FROM items
    WHERE shop_id = :shop_id AND is_archived = false
),
sales_window AS (
    SELECT item_id, quantity, sale_price, profit, sale_date
    FROM sale_records
    WHERE shop_id = :shop_id AND sale_date >= :since
),
purchases_window AS (
    SELECT item_id, supplier_name, quantity, total_price, created_at
    FROM purchase_history
    WHERE shop_id = :shop_id AND created_at >= :since
)
SELECT json_build_object(
    'items', (
        SELECT COALESCE(json_agg(to_jsonb(i)), '[]'::json) FROM live_items i
    ),
    'totals', (
        SELECT json_build_object(
            'revenue', COALESCE(SUM(quantity * sale_price), 0)::text,
            'profit',  COALESCE(SUM(profit), 0)::text
        ) FROM sales_window
    ),
    'by_item', (
        SELECT COALESCE(json_agg(x), '[]'::json) FROM (
            SELECT item_id,
                   SUM(profit)::text   AS profit,
                   SUM(quantity)::text AS volume
            FROM sales_window GROUP BY item_id
        ) x
    ),
    'by_supplier', (
        SELECT COALESCE(json_agg(x), '[]'::json) FROM (
            SELECT supplier_name, SUM(total_price)::text AS total
            FROM purchases_window GROUP BY supplier_name
        ) x
    ),
    'purchase_days', (
        SELECT COALESCE(json_agg(t.d ORDER BY t.d), '[]'::json) FROM (
            SELECT DISTINCT created_at::date AS d FROM purchases_window
        ) t
    ),
    'recent_sales', (
        SELECT COALESCE(json_agg(x), '[]'::json) FROM (
            SELECT item_id,
                   quantity::text               AS quantity,
                   (quantity * sale_price)::text AS amount,
                   sale_date                     AS ts
            FROM sales_window ORDER BY sale_date DESC LIMIT 10
        ) x
    ),
    'recent_purchases', (
        SELECT COALESCE(json_agg(x), '[]'::json) FROM (
            SELECT item_id,
                   quantity::text    AS quantity,
                   total_price::text AS amount,
                   created_at        AS ts
            FROM purchases_window ORDER BY created_at DESC LIMIT 10
        ) x
    )
) AS payload
"""
)


def _dec(value) -> Decimal:
    """Numerics arrive as exact decimal strings; NULL aggregates as None."""
    return Decimal(value) if value is not None else Decimal(0)


def _item_from_row(row: dict) -> SimpleNamespace:
    """Adapts a JSON item row to the attribute access `to_item_out` expects, so
    the ItemOut mapping stays defined in exactly one place."""
    return SimpleNamespace(
        item_id=row["item_id"],
        canonical_name=row["canonical_name"],
        aliases=row.get("aliases") or [],
        unit=row["unit"],
        avg_cost=_dec(row["avg_cost"]),
        stock_qty=_dec(row["stock_qty"]),
        selling_price=_dec(row["selling_price"]),
        target_margin_pct=(
            Decimal(row["target_margin_pct"]) if row["target_margin_pct"] is not None else None
        ),
        category=row["category"],
        low_stock_threshold=(
            Decimal(row["low_stock_threshold"]) if row["low_stock_threshold"] is not None else None
        ),
        is_archived=row["is_archived"],
        wont_restock=row["wont_restock"],
    )


def build_dashboard(db: Session, shop: ShopContext, days: int = 30) -> DashboardOut:
    cache_key = f"{shop.id}:{days}"
    cached = _CACHE.get(cache_key)
    if cached and (time.time() - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    since = datetime.now(timezone.utc) - timedelta(days=days)
    payload = db.execute(_DASHBOARD_SQL, {"shop_id": str(shop.id), "since": since}).scalar_one()

    items = [_item_from_row(r) for r in payload["items"]]
    item_out_list = [to_item_out(i, shop) for i in items]
    item_name_by_id = {str(i.item_id): i.canonical_name for i in items}

    inventory_value = sum((i.stock_qty * i.avg_cost for i in items), Decimal(0))
    low_stock_items = [i for i in item_out_list if i.is_low_stock]
    below_cost_items = [i for i in item_out_list if i.is_below_cost]

    revenue = _dec(payload["totals"]["revenue"])
    profit = _dec(payload["totals"]["profit"])

    top_items_by_profit = sorted(
        (
            NamedValue(name=item_name_by_id.get(r["item_id"], "Unknown"), value=_dec(r["profit"]))
            for r in payload["by_item"]
        ),
        key=lambda x: x.value,
        reverse=True,
    )[:8]
    top_items_by_volume = sorted(
        (
            NamedValue(name=item_name_by_id.get(r["item_id"], "Unknown"), value=_dec(r["volume"]))
            for r in payload["by_item"]
        ),
        key=lambda x: x.value,
        reverse=True,
    )[:8]

    category_value: dict[str, Decimal] = {}
    for i in items:
        cat = i.category or "Uncategorized"
        category_value[cat] = category_value.get(cat, Decimal(0)) + i.stock_qty * i.avg_cost
    category_breakdown = sorted(
        (NamedValue(name=k, value=v) for k, v in category_value.items()),
        key=lambda x: x.value,
        reverse=True,
    )

    supplier_spend = sorted(
        (
            NamedValue(name=r["supplier_name"] or "Unknown supplier", value=_dec(r["total"]))
            for r in payload["by_supplier"]
        ),
        key=lambda x: x.value,
        reverse=True,
    )

    # Inventory value at each day that saw a purchase in the window.
    inventory_value_trend = [
        TrendPoint(date=date.fromisoformat(d), value=inventory_value) for d in payload["purchase_days"]
    ]
    if not inventory_value_trend:
        inventory_value_trend = [
            TrendPoint(date=datetime.now(timezone.utc).date(), value=inventory_value)
        ]

    activity: list[ActivityEntry] = [
        ActivityEntry(
            type="purchase",
            item_name=item_name_by_id.get(r["item_id"], "Unknown"),
            quantity=_dec(r["quantity"]),
            amount=_dec(r["amount"]),
            date=r["ts"],
        )
        for r in payload["recent_purchases"]
    ] + [
        ActivityEntry(
            type="sale",
            item_name=item_name_by_id.get(r["item_id"], "Unknown"),
            quantity=_dec(r["quantity"]),
            amount=_dec(r["amount"]),
            date=r["ts"],
        )
        for r in payload["recent_sales"]
    ]
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
