"""Bill/invoice extraction via Gemini vision (PRD Section 9, Phase 2).

One service handles both bill types: the image-in, JSON-out mechanics are
identical, only the prompt and one field name differ (`supplier_name` for
purchases vs. `customer_name` for sales). Keeping it single-sourced means the
vision call, timeout handling and defensive parsing exist in exactly one place.

Two deliberate design choices worth knowing before editing:

1.  **The image is never persisted.** Bytes arrive from the request, go
    straight to the model, and are dropped when the function returns — no
    disk, no object storage. That is a hard requirement from the PRD (privacy)
    and also why this feature adds zero storage cost.

2.  **Nothing here raises on a badly-read bill.** A bill the model could only
    half-read is still useful, because the owner confirms every field in the
    existing manual form anyway. So unreadable fields come back as `None` with
    a warning attached, and only a genuine infrastructure failure (no API key,
    model unreachable) raises.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime
from functools import lru_cache
from typing import Any

from pydantic import ValidationError

from ..config import get_settings
from ..schemas import ExtractedBill

logger = logging.getLogger(__name__)

# Bills are small, single-image requests; if the model hasn't answered by now
# something is wrong and the owner is better served by a quick, clear failure
# than a spinner. Expressed in milliseconds — that is the unit HttpOptions
# takes, not seconds.
_REQUEST_TIMEOUT_MS = 45_000

# What we accept from the client. HEIC/HEIF are here because that is what
# iPhones produce by default; the frontend re-encodes to JPEG before upload,
# but accepting them server-side keeps the API usable from other clients.
SUPPORTED_MIME_TYPES = frozenset(
    {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        "application/pdf",
    }
)

# Vercel rejects request bodies over 4.5MB before our code ever runs, so this
# is really a second line of defence behind the client-side downscale. Set a
# little under the platform limit so we return a helpful message instead of
# the platform's opaque 413.
MAX_IMAGE_BYTES = 4 * 1024 * 1024


class ExtractionUnavailable(RuntimeError):
    """Bill scanning isn't configured or the model couldn't be reached.

    Distinct from "the bill was hard to read" — this one means the feature is
    down, so the router turns it into a 503 and the UI points the owner at
    manual entry."""


_PURCHASE_INSTRUCTIONS = """\
You are a bill-parsing engine for an auto-parts service centre in India.
You are reading a SUPPLIER PURCHASE BILL — goods the shop BOUGHT.

Extract:
- supplier_name: the business the shop bought FROM (the vendor issuing the bill)
- bill_date: the date on the bill
- line_items: every product row on the bill
- misc_charges: bill-level extra charges — see the GST and misc_charges rules below

For each line item extract item_name, quantity, unit (piece/litre/set/box etc.),
unit_price (price for ONE unit) and total_price (price for the whole row).
"""

_SALE_INSTRUCTIONS = """\
You are a bill-parsing engine for an auto-parts service centre in India.
You are reading a SALES INVOICE the shop ISSUED to its own customer.

Extract:
- customer_name: the person or business the shop SOLD TO
- invoice_ref: the invoice number/reference, if printed
- bill_date: the date on the invoice
- line_items: every product row on the invoice
- misc_charges: bill-level extra charges — see the GST and misc_charges rules below

For each line item extract item_name, quantity, unit_price (price charged for
ONE unit) and total_price (price for the whole row). Ignore labour/service
charge rows that are not physical products.
"""

_GST_AND_MISC_RULES = """\
GST rules — Indian bills handle tax inconsistently, so read carefully per line:
6. For each line item also extract gst_pct (the GST/tax rate shown for that
   row, e.g. 18 for "18%" or "GST 18%") and price_includes_gst (true/false/null):
   - If the bill has a separate GST%/tax column or note next to a line, and the
     rate/amount is clearly the PRE-tax price, set price_includes_gst: false and
     fill gst_pct with that row's rate.
   - If the bill states prices are "inclusive of GST/tax", or a line clearly
     already has tax folded into its rate with no separate tax column, set
     price_includes_gst: true.
   - Different rows on the same bill can have different GST rates — read each
     row's own rate, do not assume one rate for the whole bill.
   - If you cannot tell whether tax is included, set both gst_pct and
     price_includes_gst to null rather than guessing — an unknown tax status
     must never be assumed to be zero.
   - Do NOT include the bill's tax summary rows (e.g. "Output CGST",
     "Output SGST", "Output IGST", "Total Tax") as line items — those are
     totals, not products.

misc_charges rules:
7. Extract bill-level charges that are NOT tied to a specific product row —
   e.g. "Packing & Forwarding", "Freight", "Transportation", "Loading Charges".
   Each becomes one entry: {"label": "...", "amount": <the charge, as printed>}.
   - Do NOT include "Round Off" (negligible) or the GST/tax summary rows —
     those are not owner decisions and must not appear in misc_charges.
   - If there are no such charges, return an empty list.
"""

_SHARED_RULES = """\
Rules, in order of importance:
1. Return ONLY a JSON object. No prose, no explanation, no markdown fences.
2. If you cannot confidently read a value, return null for it. NEVER guess and
   never substitute 0 for a number you could not read — a null is corrected by
   the shop owner in one tap, a wrong number silently corrupts their costs.
3. Numbers must be plain JSON numbers: no currency symbols, no thousands
   separators, no units inside the number.
4. bill_date must be formatted strictly as YYYY-MM-DD. Indian bills are
   usually DD/MM/YYYY — read them as day-first, not month-first.
5. Include every product row you can see, even if some of its fields are null.
""" + _GST_AND_MISC_RULES


def _prompt_for(bill_type: str) -> str:
    instructions = _PURCHASE_INSTRUCTIONS if bill_type == "purchase" else _SALE_INSTRUCTIONS
    return f"{instructions}\n{_SHARED_RULES}"


@lru_cache
def _client():
    """Builds the Gemini client once per warm instance.

    Constructed lazily rather than at import: the API key is optional, so an
    environment without one must still be able to import this module (and boot
    the app) — it just can't call the endpoint."""
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ExtractionUnavailable(
            "Bill scanning isn't configured on this server (no GEMINI_API_KEY). "
            "Enter the bill manually instead."
        )

    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:  # pragma: no cover - dependency is declared
        raise ExtractionUnavailable(
            "The bill-scanning dependency isn't installed on this server."
        ) from exc

    return genai.Client(
        api_key=settings.gemini_api_key,
        # The SDK already retries 429/5xx with exponential backoff internally,
        # so we deliberately do NOT wrap this in a retry loop of our own —
        # two layers would multiply into a wait long enough to look hung.
        http_options=types.HttpOptions(timeout=_REQUEST_TIMEOUT_MS),
    )


def _strip_code_fences(text: str) -> str:
    """Models are told not to emit markdown fences, and mostly comply — but a
    single stray ```json wrapper shouldn't cost the owner the whole bill."""
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    # Drop the opening fence (with optional language tag) and the closing one.
    stripped = re.sub(r"^```[a-zA-Z]*\s*", "", stripped)
    stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def _first_json_value(text: str) -> str:
    """Returns the outermost JSON value, so a stray sentence either side of the
    JSON doesn't fail the parse.

    Handles arrays as well as objects: the model occasionally answers with just
    the line-item array, and scanning only for `{` would silently clip that to
    its first element — losing every row but one."""
    candidates = [(text.find(opener), opener, closer) for opener, closer in (("{", "}"), ("[", "]"))]
    candidates = [c for c in candidates if c[0] != -1]
    if not candidates:
        return text

    start, _, closer = min(candidates)
    end = text.rfind(closer)
    if end == -1 or end < start:
        return text
    return text[start : end + 1]


_NUMERIC_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _coerce_number(value: Any) -> float | None:
    """Best-effort number reader.

    The schema asks for plain numbers, but vision models periodically hand back
    "1,250.00" or "₹450" or "2 pcs". Recovering the number is strictly better
    than dropping the field, and anything genuinely unreadable still ends up
    None rather than 0."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None

    cleaned = value.strip().replace(",", "")
    if not cleaned:
        return None
    match = _NUMERIC_RE.search(cleaned)
    if not match:
        return None
    try:
        return float(match.group())
    except ValueError:
        return None


# Day-first first: Indian bills are overwhelmingly DD/MM/YYYY, and for an
# ambiguous date like 03/04/2026 guessing month-first would silently shift the
# purchase by months in every trend chart.
_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d.%m.%Y",
    "%d/%m/%y",
    "%d-%m-%y",
    "%Y/%m/%d",
)


def _coerce_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _clean_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or text.lower() in {"null", "none", "n/a", "-"}:
        return None
    return text


def _coerce_bool(value: Any) -> bool | None:
    """Reads price_includes_gst leniently — the model sometimes answers
    "true"/"yes"/"inclusive" as a string instead of a JSON boolean."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "inclusive", "incl"}:
            return True
        if lowered in {"false", "no", "exclusive", "excl"}:
            return False
    return None


def _apply_gst(
    unit_price: float | None,
    total_price: float | None,
    quantity: float | None,
    gst_pct: float | None,
    price_includes_gst: bool | None,
) -> tuple[float | None, float | None]:
    """Turns the bill's printed rate into the shop's actual landed cost.

    A supplier bill's Rate/Amount columns are routinely pre-tax, with GST%
    printed separately — the owner's true per-unit cost is rate * (1 +
    gst_pct/100), not the printed rate. This is the one calculation this
    whole feature exists to save the owner from doing by hand on every bill.

    Deliberately conservative: with no tax information at all (gst_pct is
    None), the price is returned completely unchanged — silently adding tax
    that was never confirmed would be worse than the manual-entry status quo
    it's replacing."""
    if price_includes_gst or not gst_pct:
        return unit_price, total_price

    multiplier = 1 + (gst_pct / 100)
    new_unit = round(unit_price * multiplier, 2) if unit_price is not None else None
    if new_unit is not None and quantity:
        # Recompute the row total from the adjusted unit price rather than
        # scaling the printed total directly, so unit_price * quantity always
        # equals total_price for the owner to sanity-check by eye.
        new_total = round(new_unit * quantity, 2)
    elif total_price is not None:
        new_total = round(total_price * multiplier, 2)
    else:
        new_total = None
    return new_unit, new_total


def _normalise_payload(raw: Any) -> dict[str, Any]:
    """Maps whatever shape came back onto the ExtractedBill fields.

    Done by hand rather than by handing the dict straight to Pydantic because
    a single unreadable cell must not invalidate the entire bill — every field
    degrades to None independently."""
    if isinstance(raw, list):
        # Occasionally the model answers with just the line-item array.
        raw = {"line_items": raw}
    if not isinstance(raw, dict):
        return {}

    rows = raw.get("line_items") or raw.get("items") or raw.get("lines") or []
    if not isinstance(rows, list):
        rows = []

    lines: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = _clean_str(row.get("item_name") or row.get("name") or row.get("description"))
        quantity = _coerce_number(row.get("quantity") or row.get("qty"))
        unit_price = _coerce_number(row.get("unit_price") or row.get("rate") or row.get("price"))
        total_price = _coerce_number(row.get("total_price") or row.get("amount") or row.get("total"))
        gst_pct = _coerce_number(row.get("gst_pct") or row.get("gst_rate") or row.get("tax_pct"))
        price_includes_gst = _coerce_bool(row.get("price_includes_gst"))

        # A row with no name and no numbers at all is noise (a table header, a
        # stray footer line) rather than a product — drop it silently.
        if name is None and quantity is None and unit_price is None and total_price is None:
            continue

        adjusted_unit, adjusted_total = _apply_gst(unit_price, total_price, quantity, gst_pct, price_includes_gst)

        lines.append(
            {
                "item_name": name,
                "quantity": quantity,
                "unit": _clean_str(row.get("unit")),
                "unit_price": adjusted_unit,
                "total_price": adjusted_total,
                "gst_pct": gst_pct,
                "price_includes_gst": price_includes_gst,
            }
        )

    misc_raw = raw.get("misc_charges") or raw.get("other_charges") or []
    misc_charges: list[dict[str, Any]] = []
    if isinstance(misc_raw, list):
        for entry in misc_raw:
            if not isinstance(entry, dict):
                continue
            label = _clean_str(entry.get("label") or entry.get("name") or entry.get("description"))
            amount = _coerce_number(entry.get("amount") or entry.get("value"))
            # An unnamed or unpriced charge can't be shown to the owner as a
            # meaningful choice, so it's dropped rather than passed through.
            if label is None or amount is None:
                continue
            misc_charges.append({"label": label, "amount": amount})

    return {
        "supplier_name": _clean_str(raw.get("supplier_name") or raw.get("vendor_name")),
        "customer_name": _clean_str(raw.get("customer_name") or raw.get("buyer_name")),
        "invoice_ref": _clean_str(raw.get("invoice_ref") or raw.get("invoice_no") or raw.get("invoice_number")),
        "bill_date": _coerce_date(raw.get("bill_date") or raw.get("invoice_date") or raw.get("date")),
        "line_items": lines,
        "misc_charges": misc_charges,
    }


def parse_model_output(text: str) -> ExtractedBill:
    """Turns raw model text into a validated ExtractedBill.

    Split out from the network call so the whole parsing contract — fences,
    stray prose, "₹1,250", DD/MM/YYYY dates, junk rows — is unit-testable
    without an API key or a network round trip."""
    if not text or not text.strip():
        return ExtractedBill()

    candidate = _first_json_value(_strip_code_fences(text))
    try:
        raw = json.loads(candidate)
    except json.JSONDecodeError:
        logger.warning("Bill extraction returned non-JSON output")
        return ExtractedBill()

    try:
        return ExtractedBill.model_validate(_normalise_payload(raw))
    except ValidationError:
        logger.warning("Bill extraction output failed schema validation", exc_info=True)
        return ExtractedBill()


def extract_bill(image_bytes: bytes, mime_type: str, bill_type: str) -> ExtractedBill:
    """Sends one bill image to Gemini and returns the structured result.

    Raises ExtractionUnavailable only when the feature itself is unusable (not
    configured, model unreachable). A bill the model simply couldn't read comes
    back as an empty/partial ExtractedBill so the caller can fall back to an
    empty manual form rather than dead-ending the owner."""
    if bill_type not in {"purchase", "sale"}:
        raise ValueError(f"Unknown bill_type: {bill_type!r}")

    settings = get_settings()
    client = _client()

    from google.genai import types

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[
                _prompt_for(bill_type),
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            ],
            config=types.GenerateContentConfig(
                # Asking for JSON at the API level rather than trusting the
                # prompt alone: it constrains decoding, so fenced/prefixed
                # output becomes the rare exception the parser mops up.
                response_mime_type="application/json",
                response_json_schema=ExtractedBill.model_json_schema(),
                # Near-zero temperature: this is transcription, not writing.
                # Any creativity here shows up as an invented price.
                temperature=0.0,
            ),
        )
    except Exception as exc:
        # Deliberately broad. The SDK raises provider-specific error types that
        # vary by version, and every one of them means the same thing to the
        # owner: scanning is unavailable right now, type it in instead.
        logger.warning("Gemini bill extraction call failed", exc_info=True)
        raise ExtractionUnavailable(
            "Couldn't reach the bill-reading service. Please enter this bill manually."
        ) from exc

    return parse_model_output(getattr(response, "text", "") or "")
