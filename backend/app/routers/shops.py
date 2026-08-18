import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models
from ..auth import get_current_shop_id
from ..db import get_db
from ..deps import get_current_shop_row, invalidate_shop_cache
from ..schemas import ShopCreate, ShopOut

router = APIRouter(prefix="/shops", tags=["shops"])


@router.post("", response_model=ShopOut, status_code=status.HTTP_201_CREATED)
def create_shop(
    body: ShopCreate,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: Session = Depends(get_db),
):
    existing = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Shop profile already exists")
    shop = models.Shop(
        id=shop_id,
        name=body.name,
        default_target_margin_pct=body.default_target_margin_pct,
        default_low_stock_threshold=body.default_low_stock_threshold,
    )
    db.add(shop)
    db.commit()
    db.refresh(shop)
    invalidate_shop_cache(shop_id)
    return shop


@router.get("/me", response_model=ShopOut)
def get_my_shop(shop: models.Shop = Depends(get_current_shop_row)):
    return shop


@router.patch("/me", response_model=ShopOut)
def update_my_shop(
    body: ShopCreate,
    shop: models.Shop = Depends(get_current_shop_row),
    db: Session = Depends(get_db),
):
    shop.name = body.name
    shop.default_target_margin_pct = body.default_target_margin_pct
    shop.default_low_stock_threshold = body.default_low_stock_threshold
    db.commit()
    db.refresh(shop)
    # The cached snapshot feeds margin/low-stock defaults everywhere else, so
    # it has to go the moment those defaults change.
    invalidate_shop_cache(shop.id)
    return shop
