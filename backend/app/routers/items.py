import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..deps import ShopContext, get_current_shop
from ..schemas import ItemCreate, ItemMergeRequest, ItemOut, ItemUpdate, PurchaseHistoryOut
from ..services import items as items_service
from ..services.analytics import invalidate_dashboard_cache
from ..services.insights import invalidate_insights_cache

router = APIRouter(prefix="/items", tags=["items"])


@router.get("", response_model=list[ItemOut])
def list_items(
    search: str | None = None,
    category: str | None = None,
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    return items_service.list_items(db, shop, search, category)


@router.post("", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    body: ItemCreate,
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    item = items_service.create_item(db, shop, body.canonical_name, body.unit, body.category)
    if body.target_margin_pct is not None:
        item.target_margin_pct = body.target_margin_pct
    if body.low_stock_threshold is not None:
        item.low_stock_threshold = body.low_stock_threshold
    db.commit()
    db.refresh(item)
    return items_service.to_item_out(item, shop)


@router.get("/{item_id}", response_model=ItemOut)
def get_item(item_id: uuid.UUID, shop: ShopContext = Depends(get_current_shop), db: Session = Depends(get_db)):
    item = items_service.get_item(db, shop, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return items_service.to_item_out(item, shop)


@router.patch("/{item_id}", response_model=ItemOut)
def update_item(
    item_id: uuid.UUID,
    body: ItemUpdate,
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    item = items_service.update_item(db, shop, item_id, body)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.commit()
    db.refresh(item)
    invalidate_dashboard_cache(shop.id)
    invalidate_insights_cache(shop.id)
    return items_service.to_item_out(item, shop)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_item(item_id: uuid.UUID, shop: ShopContext = Depends(get_current_shop), db: Session = Depends(get_db)):
    item = items_service.get_item(db, shop, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.is_archived = True
    db.commit()
    invalidate_dashboard_cache(shop.id)
    invalidate_insights_cache(shop.id)


@router.post("/merge", response_model=ItemOut)
def merge_items(body: ItemMergeRequest, shop: ShopContext = Depends(get_current_shop), db: Session = Depends(get_db)):
    target = items_service.merge_items(db, shop, body)
    if not target:
        raise HTTPException(status_code=404, detail="Source or target item not found")
    db.commit()
    db.refresh(target)
    invalidate_dashboard_cache(shop.id)
    invalidate_insights_cache(shop.id)
    return items_service.to_item_out(target, shop)


@router.get("/{item_id}/purchase-history", response_model=list[PurchaseHistoryOut])
def item_purchase_history(
    item_id: uuid.UUID,
    supplier: str | None = None,
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    q = db.query(models.PurchaseHistory).filter(
        models.PurchaseHistory.item_id == item_id, models.PurchaseHistory.shop_id == shop.id
    )
    if supplier:
        q = q.filter(models.PurchaseHistory.supplier_name == supplier)
    return q.order_by(models.PurchaseHistory.purchase_date.desc()).all()
