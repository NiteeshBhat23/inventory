"""Bill/invoice scanning endpoint (Phase 2).

Extraction only — this router never writes to the database. It reads an image
and hands back a *proposal* that pre-fills the existing manual purchase/sale
form, which stays the single place a commit can happen. That keeps the cost
engine's only entry point the one that is already tested, and it means a
misread bill can never silently alter the owner's numbers.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import ShopContext, get_current_shop
from ..schemas import BillExtractionOut
from ..services import matching
from ..services.extraction import (
    MAX_IMAGE_BYTES,
    SUPPORTED_MIME_TYPES,
    ExtractionUnavailable,
    extract_bill,
)

router = APIRouter(prefix="/bills", tags=["bills"])


def _build_warnings(result: BillExtractionOut) -> list[str]:
    """Non-fatal things the owner should glance at before saving.

    Phrased per-item rather than as a count, because "Row 3 has no price" is
    actionable where "3 problems" just makes the owner re-read everything."""
    warnings: list[str] = []

    if not result.lines:
        warnings.append(
            "Couldn't read any items from this bill. Try a sharper, straight-on photo "
            "in good light — or just enter it manually."
        )
        return warnings

    for index, line in enumerate(result.lines, start=1):
        label = line.item_name or f"Row {index}"
        if not line.item_name:
            warnings.append(f"Row {index}: couldn't read the item name.")
        if line.quantity is None:
            warnings.append(f"{label}: couldn't read the quantity.")
        if line.unit_price is None and line.total_price is None:
            warnings.append(f"{label}: couldn't read a price.")
        elif line.gst_pct is None and line.price_includes_gst is None:
            # A price with no tax information either way — used exactly as
            # printed, which may or may not already include GST. Flagged
            # rather than assumed, since assuming wrong in either direction
            # silently mis-states the shop's real cost.
            warnings.append(f"{label}: couldn't tell if this price includes GST — check it.")

    if result.bill_date is None:
        warnings.append("Couldn't read the date — defaulted to today.")

    return warnings


@router.post("/extract", response_model=BillExtractionOut)
async def extract(
    file: UploadFile = File(...),
    bill_type: str = Form(...),
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """Reads a photographed bill and returns pre-fill data for the manual form.

    The uploaded image is held in memory for the duration of this call and
    never written to disk or object storage (PRD privacy requirement)."""
    if bill_type not in {"purchase", "sale"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="bill_type must be 'purchase' or 'sale'.",
        )

    mime = (file.content_type or "").lower()
    if mime not in SUPPORTED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Please upload a photo of the bill as a JPEG, PNG, WebP or PDF.",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That file was empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        # The client downscales before uploading, so reaching this generally
        # means a non-browser client. Give it a real number to aim at rather
        # than the platform's opaque 413.
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"That image is too large — please keep it under {MAX_IMAGE_BYTES // (1024 * 1024)}MB.",
        )

    try:
        extracted = extract_bill(image_bytes, mime, bill_type)
    except ExtractionUnavailable as exc:
        # 503 rather than 500: the request was fine, the capability is not —
        # and the UI uses this to steer the owner to manual entry.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))

    result = BillExtractionOut(
        bill_type=bill_type,
        # Only surface the party field that belongs to this bill type, so a
        # model that filled the wrong one can't leak a customer into the
        # supplier box.
        supplier_name=extracted.supplier_name if bill_type == "purchase" else None,
        customer_name=extracted.customer_name if bill_type == "sale" else None,
        invoice_ref=extracted.invoice_ref if bill_type == "sale" else None,
        bill_date=extracted.bill_date,
        lines=matching.match_lines(db, shop, extracted.line_items),
        misc_charges=extracted.misc_charges,
    )
    result.warnings = _build_warnings(result)
    return result
