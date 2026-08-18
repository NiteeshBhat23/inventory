from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..deps import ShopContext, get_current_shop
from ..services import reports as reports_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/purchases.csv")
def purchases_csv(days: int = 90, shop: ShopContext = Depends(get_current_shop), db: Session = Depends(get_db)):
    csv_text = reports_service.purchase_history_csv(db, shop, days)
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=purchase_history.csv"},
    )


@router.get("/sales.csv")
def sales_csv(days: int = 90, shop: ShopContext = Depends(get_current_shop), db: Session = Depends(get_db)):
    csv_text = reports_service.sale_history_csv(db, shop, days)
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sale_history.csv"},
    )
