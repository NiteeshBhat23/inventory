import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..deps import ShopContext, get_current_shop
from ..schemas import InsightsOut, PriceHistoryOut
from ..services import insights as insights_service

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("", response_model=InsightsOut)
def get_insights(
    days: int = 30,
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """Decision-support reports: profit leaderboard, sales velocity,
    dead-stock aging, supplier price comparison, low-margin alert,
    purchase-to-sale timing, and reorder suggestions — the replacement for
    the old CSV export pages."""
    return insights_service.build_insights(db, shop, days)


@router.get("/price-history/{item_id}", response_model=PriceHistoryOut)
def get_price_history(
    item_id: uuid.UUID,
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    item = db.query(models.Item).filter(models.Item.item_id == item_id, models.Item.shop_id == shop.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return insights_service.get_price_history(db, shop, item_id)
