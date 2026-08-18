"""Weighted-average cost engine.

Pure functions only — no DB access — so the core business logic (PRD Section 7)
can be unit-tested in isolation from the API/DB layer.
"""

from dataclasses import dataclass
from decimal import Decimal


class InvalidPurchaseError(ValueError):
    """Raised when a purchase line has a non-positive quantity/price.
    Never silently coerced — the caller must reject the row and force
    manual correction, per PRD Section 7 edge cases."""


@dataclass(frozen=True)
class CostResult:
    new_avg_cost: Decimal
    new_stock_qty: Decimal


def compute_new_avg_cost(
    old_qty: Decimal,
    old_avg_cost: Decimal,
    purchase_qty: Decimal,
    purchase_unit_price: Decimal,
) -> CostResult:
    """Implements PRD Section 7:

        new_avg_cost = ((old_qty * old_avg_cost) + (purchase_qty * purchase_unit_price))
                        / (old_qty + purchase_qty)

    Edge cases handled explicitly:
    - old_qty == 0 (first-ever purchase, or restock after selling out):
      new_avg_cost is just purchase_unit_price — the old value carries no
      weight, and this also sidesteps any accidental divide-by-zero.
    - purchase_qty <= 0 or purchase_unit_price <= 0: rejected outright.
      Bad OCR/typo data must never be allowed to zero out or invert the
      average cost, or push stock negative.
    """
    if purchase_qty <= 0:
        raise InvalidPurchaseError("Purchase quantity must be greater than zero.")
    if purchase_unit_price <= 0:
        raise InvalidPurchaseError("Purchase unit price must be greater than zero.")
    if old_qty < 0:
        raise InvalidPurchaseError("Existing stock quantity cannot be negative.")

    if old_qty == 0:
        new_avg_cost = purchase_unit_price
    else:
        total_value = (old_qty * old_avg_cost) + (purchase_qty * purchase_unit_price)
        new_avg_cost = total_value / (old_qty + purchase_qty)

    return CostResult(
        new_avg_cost=new_avg_cost,
        new_stock_qty=old_qty + purchase_qty,
    )


def derive_unit_price(quantity: Decimal, total_price: Decimal | None, unit_price: Decimal | None) -> Decimal:
    """Bill shows total, not unit price -> derive unit_price = total_price / quantity.
    If quantity is zero/missing this is an InvalidPurchaseError, never a silent
    divide-by-zero (PRD Section 7 edge case)."""
    if unit_price is not None:
        return unit_price
    if total_price is None:
        raise InvalidPurchaseError("Either unit_price or total_price must be provided.")
    if quantity <= 0:
        raise InvalidPurchaseError("Quantity must be greater than zero to derive unit price.")
    return total_price / quantity


def compute_suggested_selling_price(avg_cost: Decimal, target_margin_pct: Decimal) -> Decimal:
    """selling_price = cost * (1 + margin%)"""
    return avg_cost * (Decimal(1) + target_margin_pct / Decimal(100))


def compute_sale_profit(sale_price: Decimal, cost_at_sale: Decimal, quantity: Decimal) -> Decimal:
    return (sale_price - cost_at_sale) * quantity


def is_below_cost(price: Decimal, avg_cost: Decimal) -> bool:
    return price < avg_cost


@dataclass(frozen=True)
class SaleLineEvaluation:
    blocked: bool
    block_reason: str | None
    below_cost: bool
    profit: Decimal


def evaluate_sale_line(
    available_stock: Decimal,
    avg_cost: Decimal,
    quantity: Decimal,
    sale_price: Decimal,
    override_below_cost: bool,
) -> SaleLineEvaluation:
    """Decides whether a manual-entry sale line may proceed (PRD Flow C2 /
    FR-12, FR-13):
    - Never let stock go negative — block, don't allow it.
    - Block a below-cost price unless the owner explicitly overrides,
      since in manual entry the price is being set in real time and the
      app can still intervene before the sale happens.
    """
    below_cost = is_below_cost(sale_price, avg_cost)
    profit = compute_sale_profit(sale_price, avg_cost, quantity)

    if quantity > available_stock:
        return SaleLineEvaluation(True, f"Only {available_stock} in stock", below_cost, profit)
    if below_cost and not override_below_cost:
        return SaleLineEvaluation(True, "Sale price is below average cost — confirm override to proceed", below_cost, profit)
    return SaleLineEvaluation(False, None, below_cost, profit)
