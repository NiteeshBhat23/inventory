"""Decision-support reports — replaces the old CSV export pages.

Same principle as the dashboard rewrite in analytics.py: one SQL round trip
computing every section server-side, rather than pulling raw rows into Python
and aggregating in a loop. The individual formulas are simple; what makes
this worth documenting is *why* each one is shaped the way it is, since
that's the part a reviewer can't get back from the SQL alone.
"""

import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..deps import ShopContext
from ..schemas import (
    AgingRow,
    InsightsOut,
    LowMarginRow,
    PriceHistoryOut,
    PriceHistoryPoint,
    ProfitLeaderboardRow,
    ReorderRow,
    SupplierPriceRow,
    TimingRow,
    VelocityRow,
)

_CACHE: dict[str, tuple[float, InsightsOut]] = {}
_CACHE_TTL_SECONDS = 30


def invalidate_insights_cache(shop_id) -> None:
    prefix = f"{shop_id}:"
    for key in [k for k in _CACHE if k.startswith(prefix)]:
        _CACHE.pop(key, None)


# Aging buckets follow the standard retail convention (Shopify/NetSuite/
# Finale all use the same 30/60/90 breakpoints; see the Insights review
# conversation for sources). "Never sold" is its own bucket rather than
# folded into 90+ — an item that's simply never moved is a different problem
# from one whose sales dried up.
def _aging_bucket(days_since_last_sale: int | None) -> str:
    if days_since_last_sale is None:
        return "never sold"
    if days_since_last_sale <= 30:
        return "0-30 days"
    if days_since_last_sale <= 60:
        return "31-60 days"
    if days_since_last_sale <= 90:
        return "61-90 days"
    return "90+ days"


# Purchase-to-sale timing and the supplier price comparison intentionally
# look at ALL history, not just the selected window — "which supplier is
# cheapest" and "how long does this usually sit before it sells" are stable
# properties of an item, not something that should reset every time someone
# switches the dashboard's date range.
_INSIGHTS_SQL = text(
    """
WITH live_items AS (
    SELECT item_id, canonical_name,
           avg_cost::text AS avg_cost,
           stock_qty::text AS stock_qty,
           selling_price::text AS selling_price,
           target_margin_pct::text AS target_margin_pct
    FROM items
    WHERE shop_id = :shop_id AND is_archived = false
),
sales_window AS (
    SELECT item_id, quantity, sale_price, profit, sale_date
    FROM sale_records
    WHERE shop_id = :shop_id AND sale_date >= :since
),
profit_by_item AS (
    SELECT item_id,
           SUM(quantity)::text AS units_sold,
           SUM(quantity * sale_price)::text AS revenue,
           SUM(profit)::text AS total_profit
    FROM sales_window GROUP BY item_id
),
last_sale AS (
    SELECT item_id, MAX(sale_date) AS last_sale_date
    FROM sale_records WHERE shop_id = :shop_id GROUP BY item_id
),
supplier_best AS (
    SELECT DISTINCT ON (item_id)
           item_id, supplier_name, unit_price::text AS unit_price, purchase_date
    FROM purchase_history
    WHERE shop_id = :shop_id
    ORDER BY item_id, unit_price ASC, purchase_date DESC
),
supplier_counts AS (
    SELECT item_id, COUNT(DISTINCT supplier_name) AS supplier_count
    FROM purchase_history
    WHERE shop_id = :shop_id AND supplier_name IS NOT NULL
    GROUP BY item_id
),
-- For each sale, the most recent purchase of the same item that came before
-- it — the gap between the two approximates "how long this sat before it
-- sold". A LATERAL join is the natural fit here: "the last purchase before
-- THIS sale" can't be expressed as a plain GROUP BY.
sale_lag AS (
    SELECT s.item_id, EXTRACT(EPOCH FROM (s.sale_date - p.purchase_date::timestamptz)) / 86400 AS days
    FROM sale_records s
    JOIN LATERAL (
        SELECT purchase_date FROM purchase_history p
        WHERE p.item_id = s.item_id AND p.shop_id = s.shop_id
          AND p.purchase_date <= s.sale_date::date
        ORDER BY p.purchase_date DESC LIMIT 1
    ) p ON true
    WHERE s.shop_id = :shop_id
),
timing AS (
    SELECT item_id, AVG(days)::text AS avg_days, COUNT(*) AS sample_size
    FROM sale_lag GROUP BY item_id
)
SELECT json_build_object(
    'items', (SELECT COALESCE(json_agg(to_jsonb(i)), '[]'::json) FROM live_items i),
    'profit_by_item', (SELECT COALESCE(json_agg(to_jsonb(p)), '[]'::json) FROM profit_by_item p),
    'last_sale', (SELECT COALESCE(json_agg(to_jsonb(l)), '[]'::json) FROM last_sale l),
    'supplier_best', (SELECT COALESCE(json_agg(to_jsonb(b)), '[]'::json) FROM supplier_best b),
    'supplier_counts', (SELECT COALESCE(json_agg(to_jsonb(c)), '[]'::json) FROM supplier_counts c),
    'timing', (SELECT COALESCE(json_agg(to_jsonb(t)), '[]'::json) FROM timing t)
) AS payload
"""
)


def _dec(value) -> Decimal:
    return Decimal(value) if value is not None else Decimal(0)


def build_insights(db: Session, shop: ShopContext, days: int = 30) -> InsightsOut:
    cache_key = f"{shop.id}:{days}"
    cached = _CACHE.get(cache_key)
    if cached and (time.time() - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    since = datetime.now(timezone.utc) - timedelta(days=days)
    today = datetime.now(timezone.utc).date()
    payload = db.execute(_INSIGHTS_SQL, {"shop_id": str(shop.id), "since": since}).scalar_one()

    items_by_id = {r["item_id"]: r for r in payload["items"]}
    name = lambda item_id: items_by_id.get(item_id, {}).get("canonical_name", "Unknown")  # noqa: E731

    # ---- Profit leaderboard ----
    profit_leaderboard = []
    for r in payload["profit_by_item"]:
        units = _dec(r["units_sold"])
        revenue = _dec(r["revenue"])
        profit = _dec(r["total_profit"])
        if units <= 0:
            continue
        # Margin = profit relative to cost (revenue - profit), not to revenue —
        # matches the per-item margin shown on the Inventory list.
        cost = revenue - profit
        profit_leaderboard.append(
            ProfitLeaderboardRow(
                item_id=r["item_id"],
                item_name=name(r["item_id"]),
                units_sold=units,
                revenue=revenue,
                total_profit=profit,
                profit_per_unit=(profit / units) if units else Decimal(0),
                margin_pct=float(profit / cost * 100) if cost > 0 else 0.0,
            )
        )
    profit_leaderboard.sort(key=lambda r: r.total_profit, reverse=True)

    # ---- Sales velocity ----
    velocity = [
        VelocityRow(
            item_id=r.item_id,
            item_name=r.item_name,
            units_sold=r.units_sold,
            units_per_day=float(r.units_sold) / days if days > 0 else 0.0,
        )
        for r in profit_leaderboard
    ]
    velocity.sort(key=lambda r: r.units_per_day, reverse=True)

    # ---- Aging / dead stock ----
    last_sale_by_item = {r["item_id"]: r["last_sale_date"] for r in payload["last_sale"]}
    units_sold_by_item = {r["item_id"]: _dec(r["units_sold"]) for r in payload["profit_by_item"]}
    aging = []
    for item_id, item in items_by_id.items():
        stock_qty = _dec(item["stock_qty"])
        if stock_qty <= 0:
            continue  # nothing sitting on the shelf, nothing to age
        last_sale_raw = last_sale_by_item.get(item_id)
        days_since = None
        if last_sale_raw:
            last_sale_dt = datetime.fromisoformat(last_sale_raw)
            days_since = (datetime.now(timezone.utc).date() - last_sale_dt.date()).days
        units_sold = units_sold_by_item.get(item_id, Decimal(0))
        denom = units_sold + stock_qty
        aging.append(
            AgingRow(
                item_id=item_id,
                item_name=item["canonical_name"],
                stock_qty=stock_qty,
                days_since_last_sale=days_since,
                bucket=_aging_bucket(days_since),
                units_sold_in_period=units_sold,
                sell_through_pct=float(units_sold / denom * 100) if denom > 0 else None,
            )
        )
    # Oldest / least-sold first — the whole point of the report is "what
    # needs attention", so that goes at the top rather than the bottom.
    aging.sort(key=lambda r: (r.days_since_last_sale is None, -(r.days_since_last_sale or 0)), reverse=True)

    # ---- Supplier price comparison ----
    supplier_count_by_item = {r["item_id"]: r["supplier_count"] for r in payload["supplier_counts"]}
    supplier_comparison = []
    for r in payload["supplier_best"]:
        item = items_by_id.get(r["item_id"])
        if not item:
            continue
        current_cost = _dec(item["avg_cost"])
        best_price = _dec(r["unit_price"])
        supplier_comparison.append(
            SupplierPriceRow(
                item_id=r["item_id"],
                item_name=item["canonical_name"],
                current_avg_cost=current_cost,
                best_price=best_price,
                # Same convention as the dashboard's supplier_spend breakdown
                # and the purchase-history drill-down — a NULL supplier_name
                # reads as "Unknown supplier" everywhere in the UI, not None.
                best_supplier=r["supplier_name"] or "Unknown supplier",
                best_price_date=date.fromisoformat(r["purchase_date"]),
                supplier_count=supplier_count_by_item.get(r["item_id"], 1),
                overpaying=current_cost > best_price,
            )
        )
    supplier_comparison.sort(key=lambda r: r.overpaying, reverse=True)

    # ---- Low margin alert ----
    # Flags items selling below their OWN target margin — the same
    # target_margin_pct already used to suggest a price for new items — not
    # an arbitrary fixed cutoff, so the alert means the same thing the rest
    # of the app already means by "margin".
    low_margin = []
    for item in items_by_id.values():
        selling_price = _dec(item["selling_price"])
        avg_cost = _dec(item["avg_cost"])
        if selling_price <= 0 or avg_cost <= 0:
            continue
        # Margin = profit relative to cost, not to selling price.
        actual_margin = float((selling_price - avg_cost) / avg_cost * 100)
        target_margin = float(item["target_margin_pct"]) if item["target_margin_pct"] else float(shop.default_target_margin_pct)
        if actual_margin < target_margin:
            low_margin.append(
                LowMarginRow(
                    item_id=item["item_id"],
                    item_name=item["canonical_name"],
                    avg_cost=avg_cost,
                    selling_price=selling_price,
                    margin_pct=actual_margin,
                    target_margin_pct=target_margin,
                    is_below_cost=selling_price < avg_cost,
                )
            )
    low_margin.sort(key=lambda r: r.margin_pct)

    # ---- Purchase-to-sale timing ----
    timing = [
        TimingRow(
            item_id=r["item_id"],
            item_name=name(r["item_id"]),
            avg_days_to_sell=round(float(r["avg_days"]), 1),
            sample_size=r["sample_size"],
        )
        for r in payload["timing"]
    ]
    timing.sort(key=lambda r: r.avg_days_to_sell, reverse=True)

    # ---- Reorder suggestions ----
    # A transparent, explainable heuristic rather than a black box: cover the
    # next 30 days at the item's own recent sell-through rate, on top of
    # whatever's already on the shelf. Only surfaced for items actually
    # selling (units_per_day > 0) and running low relative to that pace —
    # an item with plenty of runway left doesn't need a suggestion yet.
    velocity_by_item = {r.item_id: r.units_per_day for r in velocity}
    reorder = []
    for item in items_by_id.values():
        upd = velocity_by_item.get(item["item_id"], 0.0)
        if upd <= 0:
            continue
        stock_qty = float(_dec(item["stock_qty"]))
        days_left = stock_qty / upd if upd > 0 else None
        if days_left is not None and days_left <= 14:
            target_stock = upd * 30
            reorder.append(
                ReorderRow(
                    item_id=item["item_id"],
                    item_name=item["canonical_name"],
                    stock_qty=_dec(item["stock_qty"]),
                    units_per_day=round(upd, 2),
                    days_of_stock_left=round(days_left, 1),
                    suggested_reorder_qty=round(max(target_stock - stock_qty, 0), 0),
                )
            )
    reorder.sort(key=lambda r: r.days_of_stock_left or 0)

    result = InsightsOut(
        days=days,
        profit_leaderboard=profit_leaderboard,
        velocity=velocity,
        aging=aging,
        supplier_comparison=supplier_comparison,
        low_margin=low_margin,
        timing=timing,
        reorder=reorder,
    )
    _CACHE[cache_key] = (time.time(), result)
    return result


def get_price_history(db: Session, shop: ShopContext, item_id) -> PriceHistoryOut:
    """Merges the cost trend (derived from purchase_history, always
    available) with the selling-price trend (from selling_price_history,
    only populated from the day this feature shipped) into one timeline."""
    row = db.execute(
        text("SELECT canonical_name FROM items WHERE item_id = :id AND shop_id = :shop_id"),
        {"id": str(item_id), "shop_id": str(shop.id)},
    ).first()
    item_name = row[0] if row else "Unknown"

    cost_rows = db.execute(
        text(
            "SELECT purchase_date, avg_cost_after FROM purchase_history "
            "WHERE item_id = :id AND shop_id = :shop_id ORDER BY purchase_date"
        ),
        {"id": str(item_id), "shop_id": str(shop.id)},
    ).all()
    price_rows = db.execute(
        text(
            "SELECT changed_at, new_price FROM selling_price_history "
            "WHERE item_id = :id AND shop_id = :shop_id ORDER BY changed_at"
        ),
        {"id": str(item_id), "shop_id": str(shop.id)},
    ).all()

    points = [
        PriceHistoryPoint(date=r.purchase_date, kind="cost", value=float(r.avg_cost_after)) for r in cost_rows
    ] + [
        PriceHistoryPoint(date=r.changed_at.date(), kind="selling", value=float(r.new_price)) for r in price_rows
    ]
    points.sort(key=lambda p: p.date)
    return PriceHistoryOut(item_id=item_id, item_name=item_name, points=points)
