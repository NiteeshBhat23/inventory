from decimal import Decimal

from app.services.cost_engine import evaluate_sale_line


def test_blocks_sale_that_would_go_negative():
    ev = evaluate_sale_line(Decimal(3), Decimal(100), Decimal(5), Decimal(150), override_below_cost=False)
    assert ev.blocked is True
    assert "in stock" in ev.block_reason


def test_blocks_below_cost_without_override():
    ev = evaluate_sale_line(Decimal(10), Decimal(100), Decimal(1), Decimal(90), override_below_cost=False)
    assert ev.blocked is True
    assert ev.below_cost is True
    assert "override" in ev.block_reason.lower()


def test_allows_below_cost_with_override():
    ev = evaluate_sale_line(Decimal(10), Decimal(100), Decimal(1), Decimal(90), override_below_cost=True)
    assert ev.blocked is False
    assert ev.below_cost is True
    assert ev.profit == Decimal(-10)


def test_allows_normal_sale():
    ev = evaluate_sale_line(Decimal(10), Decimal(100), Decimal(2), Decimal(150), override_below_cost=False)
    assert ev.blocked is False
    assert ev.below_cost is False
    assert ev.profit == Decimal(100)


def test_negative_stock_check_takes_priority_over_below_cost():
    # Even with override=True, insufficient stock still blocks.
    ev = evaluate_sale_line(Decimal(1), Decimal(100), Decimal(5), Decimal(90), override_below_cost=True)
    assert ev.blocked is True
    assert "in stock" in ev.block_reason


def test_exact_remaining_stock_is_allowed():
    ev = evaluate_sale_line(Decimal(5), Decimal(100), Decimal(5), Decimal(150), override_below_cost=False)
    assert ev.blocked is False
