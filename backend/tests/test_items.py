"""Item-catalog rules that don't need a live database.

normalize_item_name and to_item_out are pure transformations — the former is
plain string handling, the latter never touches `db` despite taking a
models.Item, so both are exercised directly against hand-built objects rather
than needing a DB fixture (this repo has none; see test_cost_engine.py for
the same convention).
"""

import uuid
from decimal import Decimal

from app import models
from app.deps import ShopContext
from app.services.items import normalize_item_name, to_item_out


def _shop(low_stock_threshold=5, target_margin=20) -> ShopContext:
    return ShopContext(
        id=uuid.uuid4(),
        name="Test Shop",
        default_target_margin_pct=target_margin,
        default_low_stock_threshold=low_stock_threshold,
    )


def _item(**overrides) -> models.Item:
    defaults = dict(
        item_id=uuid.uuid4(),
        shop_id=uuid.uuid4(),
        canonical_name="TEST ITEM",
        aliases=[],
        unit="piece",
        avg_cost=Decimal(0),
        stock_qty=Decimal(0),
        selling_price=Decimal(0),
        target_margin_pct=None,
        category=None,
        low_stock_threshold=None,
        is_archived=False,
        wont_restock=False,
    )
    defaults.update(overrides)
    return models.Item(**defaults)


# ---------- normalize_item_name ----------


def test_normalize_uppercases_and_trims():
    assert normalize_item_name("  spark plug  ") == "SPARK PLUG"


def test_normalize_collapses_internal_whitespace():
    # Not just leading/trailing — "Spark   Plug" and "Spark Plug" must land
    # on the same catalog row too.
    assert normalize_item_name("Spark   Plug") == "SPARK PLUG"


def test_normalize_is_idempotent():
    assert normalize_item_name("SPARK PLUG") == "SPARK PLUG"


def test_normalize_treats_case_and_spacing_variants_as_equal():
    variants = ["Spark Plug", " spark plug", "SPARK  PLUG ", "spark plug"]
    assert len({normalize_item_name(v) for v in variants}) == 1


# ---------- wont_restock / is_low_stock ----------


def test_low_stock_flagged_normally():
    item = _item(stock_qty=Decimal(2), low_stock_threshold=Decimal(5))
    out = to_item_out(item, _shop())
    assert out.is_low_stock is True


def test_wont_restock_suppresses_the_low_stock_flag():
    item = _item(stock_qty=Decimal(0), low_stock_threshold=Decimal(5), wont_restock=True)
    out = to_item_out(item, _shop())
    assert out.is_low_stock is False
    assert out.wont_restock is True


def test_wont_restock_leaves_cost_and_stock_untouched():
    """The flag must be purely cosmetic (low-stock alert only) — it must
    never influence a number that feeds profit/revenue."""
    item = _item(stock_qty=Decimal(0), avg_cost=Decimal(42), wont_restock=True)
    out = to_item_out(item, _shop())
    assert out.avg_cost == 42
    assert out.stock_qty == 0


def test_wont_restock_false_behaves_exactly_as_before():
    item = _item(stock_qty=Decimal(0), low_stock_threshold=Decimal(5), wont_restock=False)
    out = to_item_out(item, _shop())
    assert out.is_low_stock is True
