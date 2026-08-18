from decimal import Decimal

import pytest

from app.services.cost_engine import (
    InvalidPurchaseError,
    compute_new_avg_cost,
    compute_sale_profit,
    compute_suggested_selling_price,
    derive_unit_price,
    is_below_cost,
)


def test_first_purchase_no_prior_stock():
    result = compute_new_avg_cost(Decimal(0), Decimal(0), Decimal(10), Decimal("120"))
    assert result.new_avg_cost == Decimal("120")
    assert result.new_stock_qty == Decimal(10)


def test_weighted_average_matches_prd_example():
    # PRD Section 7 worked example: 10 @ 120 existing, buy 5 @ 150 -> 130 avg, 15 stock
    result = compute_new_avg_cost(Decimal(10), Decimal(120), Decimal(5), Decimal(150))
    assert result.new_avg_cost == Decimal("130")
    assert result.new_stock_qty == Decimal(15)


def test_restock_after_sold_out_ignores_old_avg_cost():
    # stock_qty is 0 but item exists (e.g. old_avg_cost still 200 from before it sold out)
    result = compute_new_avg_cost(Decimal(0), Decimal(200), Decimal(3), Decimal(90))
    assert result.new_avg_cost == Decimal("90")
    assert result.new_stock_qty == Decimal(3)


def test_rejects_zero_purchase_quantity():
    with pytest.raises(InvalidPurchaseError):
        compute_new_avg_cost(Decimal(10), Decimal(100), Decimal(0), Decimal(50))


def test_rejects_negative_purchase_quantity():
    with pytest.raises(InvalidPurchaseError):
        compute_new_avg_cost(Decimal(10), Decimal(100), Decimal(-2), Decimal(50))


def test_rejects_zero_or_negative_unit_price():
    with pytest.raises(InvalidPurchaseError):
        compute_new_avg_cost(Decimal(10), Decimal(100), Decimal(5), Decimal(0))
    with pytest.raises(InvalidPurchaseError):
        compute_new_avg_cost(Decimal(10), Decimal(100), Decimal(5), Decimal(-10))


def test_never_divides_by_zero():
    # old_qty=0 and purchase_qty>0 must not attempt (0+purchase_qty) division blowup;
    # this is really an assertion that the function returns cleanly, not a crash.
    result = compute_new_avg_cost(Decimal(0), Decimal(0), Decimal(1), Decimal(1))
    assert result.new_stock_qty == Decimal(1)


def test_derive_unit_price_from_total():
    assert derive_unit_price(Decimal(5), Decimal(500), None) == Decimal(100)


def test_derive_unit_price_prefers_explicit_unit_price():
    assert derive_unit_price(Decimal(5), Decimal(500), Decimal(90)) == Decimal(90)


def test_derive_unit_price_rejects_missing_quantity():
    with pytest.raises(InvalidPurchaseError):
        derive_unit_price(Decimal(0), Decimal(500), None)


def test_derive_unit_price_requires_some_price():
    with pytest.raises(InvalidPurchaseError):
        derive_unit_price(Decimal(5), None, None)


def test_suggested_selling_price():
    assert compute_suggested_selling_price(Decimal(100), Decimal(20)) == Decimal(120)


def test_sale_profit_and_below_cost_flag():
    profit = compute_sale_profit(Decimal(150), Decimal(120), Decimal(3))
    assert profit == Decimal(90)
    assert is_below_cost(Decimal(100), Decimal(120)) is True
    assert is_below_cost(Decimal(150), Decimal(120)) is False
