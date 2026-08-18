from decimal import Decimal

from sqlalchemy.orm import Session

from .. import models
from ..schemas import SaleBatchIn, SaleBatchResult, SaleLineResult
from . import items as items_service
from .cost_engine import evaluate_sale_line


class SaleBlockedError(Exception):
    """Raised when one or more lines are blocked (negative stock, or
    below-cost without an explicit override). The whole batch is rejected —
    atomic commit, per PRD Section 10 — so the owner sees every problem at
    once, fixes them, and resubmits."""

    def __init__(self, result: SaleBatchResult):
        self.result = result
        super().__init__("Sale batch blocked")


def commit_sale_batch(db: Session, shop: models.Shop, batch: SaleBatchIn) -> SaleBatchResult:
    lines: list[SaleLineResult] = []
    any_blocked = False

    # Track running stock deltas per item within this batch so multiple lines
    # for the same item in one sale are validated against each other too.
    pending_qty: dict = {}

    for line in batch.lines:
        item = items_service.get_item(db, shop, line.item_id)
        if not item:
            lines.append(
                SaleLineResult(
                    item_id=line.item_id,
                    item_name="(unknown item)",
                    quantity=line.quantity,
                    sale_price=line.sale_price,
                    cost_at_sale=Decimal(0),
                    profit=Decimal(0),
                    sold_below_cost=False,
                    blocked=True,
                    block_reason="Item not found",
                )
            )
            any_blocked = True
            continue

        already_reserved = pending_qty.get(item.item_id, Decimal(0))
        remaining_stock = Decimal(item.stock_qty) - already_reserved

        evaluation = evaluate_sale_line(
            remaining_stock, Decimal(item.avg_cost), line.quantity, line.sale_price, line.override_below_cost
        )

        if evaluation.blocked:
            any_blocked = True
        else:
            pending_qty[item.item_id] = already_reserved + line.quantity

        lines.append(
            SaleLineResult(
                item_id=item.item_id,
                item_name=item.canonical_name,
                quantity=line.quantity,
                sale_price=line.sale_price,
                cost_at_sale=item.avg_cost,
                profit=evaluation.profit,
                sold_below_cost=evaluation.below_cost,
                blocked=evaluation.blocked,
                block_reason=evaluation.block_reason,
            )
        )

    if any_blocked:
        result = SaleBatchResult(
            items_sold=0,
            total_revenue=Decimal(0),
            total_profit=Decimal(0),
            below_cost_count=sum(1 for l in lines if l.sold_below_cost),
            lines=lines,
        )
        raise SaleBlockedError(result)

    try:
        for line, result_line in zip(batch.lines, lines):
            item = items_service.get_item(db, shop, line.item_id)
            item.stock_qty = Decimal(item.stock_qty) - line.quantity
            db.add(
                models.SaleRecord(
                    item_id=item.item_id,
                    shop_id=shop.id,
                    quantity=line.quantity,
                    sale_price=line.sale_price,
                    cost_at_sale=result_line.cost_at_sale,
                    profit=result_line.profit,
                    source="manual",
                    sold_below_cost=result_line.sold_below_cost,
                )
            )
        db.commit()
    except Exception:
        db.rollback()
        raise

    # SaleLineResult.quantity/sale_price/profit are floats (API response schema
    # — see schemas/__init__.py), not Decimal, so the sum must seed with a float.
    # Decimal(0) here throws "unsupported operand type(s) for +: Decimal and float".
    return SaleBatchResult(
        items_sold=len(lines),
        total_revenue=sum((l.quantity * l.sale_price for l in lines), 0.0),
        total_profit=sum((l.profit for l in lines), 0.0),
        below_cost_count=sum(1 for l in lines if l.sold_below_cost),
        lines=lines,
    )
