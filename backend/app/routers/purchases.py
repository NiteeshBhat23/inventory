from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..deps import ShopContext, get_current_shop
from ..schemas import PurchaseBatchIn, PurchaseBatchResult, PurchaseHistoryEntry
from ..services import purchases as purchases_service
from ..services.analytics import invalidate_dashboard_cache
from ..services.insights import invalidate_insights_cache
from ..services.cost_engine import InvalidPurchaseError

router = APIRouter(prefix="/purchases", tags=["purchases"])


@router.post("", response_model=PurchaseBatchResult)
def commit_purchase(
    body: PurchaseBatchIn,
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    try:
        result = purchases_service.commit_purchase_batch(db, shop, body)
    except InvalidPurchaseError as e:
        raise HTTPException(status_code=422, detail=str(e))
    invalidate_dashboard_cache(shop.id)
    invalidate_insights_cache(shop.id)
    return result


@router.get("", response_model=list[PurchaseHistoryEntry])
def purchase_history(
    days: int = 90,
    supplier: str | None = None,
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """Line-level purchase history — powers the "Spend by supplier"
    drill-down on the dashboard/reports, where the owner wants to see every
    transaction behind a total, not just the rolled-up number."""
    return purchases_service.list_purchase_history(db, shop, days, supplier)


@router.get("/suppliers", response_model=list[str])
def list_suppliers(
    search: str | None = None,
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """Supplier names this shop has bought from before — powers the supplier
    typeahead on Add Purchase (search-as-you-type, plus recently-used
    suggestions before the owner types anything)."""
    return purchases_service.list_suppliers(db, shop, search)
