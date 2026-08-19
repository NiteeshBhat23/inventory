"""Parsing and matching contract tests.

Both units are deliberately pure — no API key, no network, no database — so
the messy real-world cases (fenced output, "₹1,250.00", DD/MM/YYYY dates,
reordered part names) are pinned down here rather than discovered against a
live model.
"""

from datetime import date

import pytest

from app.services.extraction import parse_model_output
from app.services.matching import SUGGEST_FLOOR, normalise, similarity


# ---------- parse_model_output ----------


def test_parses_clean_json():
    bill = parse_model_output(
        """
        {"supplier_name": "Sharma Auto Parts", "bill_date": "2026-03-14",
         "line_items": [{"item_name": "Bosch Wiper Blade", "quantity": 4,
                         "unit": "piece", "unit_price": 450, "total_price": 1800}]}
        """
    )
    assert bill.supplier_name == "Sharma Auto Parts"
    assert bill.bill_date == date(2026, 3, 14)
    assert len(bill.line_items) == 1
    assert bill.line_items[0].quantity == 4
    assert bill.line_items[0].unit_price == 450


def test_strips_markdown_fences():
    bill = parse_model_output('```json\n{"supplier_name": "ACME"}\n```')
    assert bill.supplier_name == "ACME"


def test_ignores_prose_around_json():
    bill = parse_model_output('Here is the bill:\n{"supplier_name": "ACME"}\nHope that helps!')
    assert bill.supplier_name == "ACME"


def test_recovers_currency_and_thousands_separators():
    bill = parse_model_output(
        '{"line_items": [{"item_name": "Oil Filter", "quantity": "2 pcs",'
        ' "unit_price": "\\u20b91,250.00", "total_price": "2,500"}]}'
    )
    line = bill.line_items[0]
    assert line.quantity == 2
    assert line.unit_price == 1250.0
    assert line.total_price == 2500.0


def test_reads_indian_day_first_dates():
    # 03/04/2026 is 3 April, not 4 March. Getting this backwards would shift
    # the purchase by a month in every trend chart.
    bill = parse_model_output('{"bill_date": "03/04/2026"}')
    assert bill.bill_date == date(2026, 4, 3)


def test_unreadable_values_become_null_not_zero():
    """The single most important guarantee in this file: a price the model
    couldn't read must never arrive as 0, which would silently corrupt the
    shop's average cost."""
    bill = parse_model_output(
        '{"line_items": [{"item_name": "Brake Pad", "quantity": null, "unit_price": null}]}'
    )
    line = bill.line_items[0]
    assert line.quantity is None
    assert line.unit_price is None


def test_drops_rows_that_are_entirely_empty():
    bill = parse_model_output(
        '{"line_items": [{"item_name": null, "quantity": null, "unit_price": null,'
        ' "total_price": null}, {"item_name": "Real Part", "quantity": 1}]}'
    )
    assert len(bill.line_items) == 1
    assert bill.line_items[0].item_name == "Real Part"


def test_accepts_bare_line_item_array():
    bill = parse_model_output('[{"item_name": "Spark Plug", "quantity": 4}]')
    assert len(bill.line_items) == 1
    assert bill.line_items[0].item_name == "Spark Plug"


@pytest.mark.parametrize("garbage", ["", "   ", "I could not read this bill.", "{not json"])
def test_unparseable_output_degrades_to_empty_bill(garbage):
    """A failure here must be an empty form, never an exception — the owner
    always keeps the manual fallback."""
    bill = parse_model_output(garbage)
    assert bill.line_items == []
    assert bill.supplier_name is None


# ---------- GST handling ----------
# Modeled directly on a real supplier bill: per-line GST% shown separately
# from a pre-tax rate ("GX80 CARBURETOR ... 750.00" with "18 %" GST alongside),
# plus bill-level Packing & Forwarding — see AddPurchase's misc-charge prompt.


def test_gst_added_to_pretax_price():
    bill = parse_model_output(
        '{"line_items": [{"item_name": "GX80 Carburetor", "quantity": 2,'
        ' "unit_price": 750, "total_price": 1500, "gst_pct": 18,'
        ' "price_includes_gst": false}]}'
    )
    line = bill.line_items[0]
    # 750 * 1.18 = 885 — the owner's real landed cost, not the printed rate.
    assert line.unit_price == 885.0
    assert line.total_price == 1770.0
    assert line.gst_pct == 18
    assert line.price_includes_gst is False


def test_price_already_including_gst_is_left_alone():
    bill = parse_model_output(
        '{"line_items": [{"item_name": "Brake Pad", "quantity": 1,'
        ' "unit_price": 500, "total_price": 500, "gst_pct": 18,'
        ' "price_includes_gst": true}]}'
    )
    line = bill.line_items[0]
    assert line.unit_price == 500.0
    assert line.total_price == 500.0


def test_no_gst_information_is_never_grossed_up():
    """The conservative default: with no tax signal at all, the price must
    come through completely unchanged — silently adding tax that was never
    confirmed would corrupt the owner's cost worse than not scanning at all."""
    bill = parse_model_output('{"line_items": [{"item_name": "Wiper Blade", "unit_price": 450}]}')
    line = bill.line_items[0]
    assert line.unit_price == 450.0
    assert line.gst_pct is None
    assert line.price_includes_gst is None


def test_different_gst_rates_per_line_on_same_bill():
    # A real bill mixes rates — e.g. spark plugs at 18%, filters at 5%.
    bill = parse_model_output(
        '{"line_items": ['
        '{"item_name": "Spark Plug", "unit_price": 50, "gst_pct": 18, "price_includes_gst": false},'
        '{"item_name": "Air Filter", "unit_price": 750, "gst_pct": 5, "price_includes_gst": false}'
        "]}"
    )
    spark, air = bill.line_items
    assert spark.unit_price == 59.0
    assert air.unit_price == 787.5


def test_string_price_includes_gst_is_coerced():
    bill = parse_model_output(
        '{"line_items": [{"item_name": "Oil Filter", "unit_price": 500,'
        ' "gst_pct": 18, "price_includes_gst": "true"}]}'
    )
    assert bill.line_items[0].unit_price == 500.0  # unchanged — already inclusive


# ---------- misc_charges ----------


def test_misc_charges_parsed():
    bill = parse_model_output(
        '{"line_items": [{"item_name": "Oil Filter", "unit_price": 500}],'
        ' "misc_charges": [{"label": "Packing & Forwarding", "amount": 99.0},'
        ' {"label": "Freight", "amount": 150}]}'
    )
    assert len(bill.misc_charges) == 2
    assert bill.misc_charges[0].label == "Packing & Forwarding"
    assert bill.misc_charges[0].amount == 99.0
    assert bill.misc_charges[1].amount == 150.0


def test_misc_charges_default_empty():
    bill = parse_model_output('{"line_items": [{"item_name": "Oil Filter"}]}')
    assert bill.misc_charges == []


def test_misc_charge_missing_label_or_amount_is_dropped():
    bill = parse_model_output(
        '{"misc_charges": [{"label": "Round Off"}, {"amount": 99.0}, '
        '{"label": "Freight", "amount": 150.0}]}'
    )
    assert len(bill.misc_charges) == 1
    assert bill.misc_charges[0].label == "Freight"


def test_alternate_field_names():
    bill = parse_model_output(
        '{"vendor_name": "ACME", "invoice_date": "2026-01-05",'
        ' "items": [{"description": "Clutch Cable", "qty": 3, "rate": 200, "amount": 600}]}'
    )
    assert bill.supplier_name == "ACME"
    assert bill.bill_date == date(2026, 1, 5)
    assert bill.line_items[0].item_name == "Clutch Cable"
    assert bill.line_items[0].quantity == 3
    assert bill.line_items[0].unit_price == 200


# ---------- matching ----------


def test_normalise_strips_punctuation_and_case():
    assert normalise('BOSCH-WIPER (20")') == "bosch wiper 20"


def test_identical_names_score_one():
    assert similarity("Oil Filter", "oil filter") == 1.0


def test_word_reorder_still_matches_strongly():
    # "brake pad front" and "front brake pad" are the same part.
    assert similarity("brake pad front", "front brake pad") > 0.8


def test_one_word_different_scores_below_floor():
    # "oil filter" vs "air filter" share most characters but are different
    # parts — a character-only metric would wrongly rank these as a match.
    assert similarity("oil filter", "air filter") < 0.8


def test_unrelated_parts_fall_below_suggest_floor():
    assert similarity("Bosch Wiper Blade", "Clutch Cable") < SUGGEST_FLOOR


def test_empty_name_scores_zero():
    assert similarity("", "Oil Filter") == 0.0
