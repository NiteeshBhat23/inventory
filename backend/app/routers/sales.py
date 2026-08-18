from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..deps import ShopContext, get_current_shop
from ..schemas import SaleBatchIn, SaleBatchResult, SaleHistoryEntry
from ..services import sales as sales_service
from ..services.analytics import invalidate_dashboard_cache
from ..services.insights import invalidate_insights_cache

router = APIRouter(prefix="/sales", tags=["sales"])


@router.post("", response_model=SaleBatchResult)
def commit_sale(
    body: SaleBatchIn,
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    try:
        result = sales_service.commit_sale_batch(db, shop, body)
    except sales_service.SaleBlockedError as e:
        # 409: batch rejected, nothing committed — client shows block_reason per
        # line (negative stock, or below-cost needing override) and resubmits.
        return JSONResponse(status_code=409, content=e.result.model_dump(mode="json"))
    invalidate_dashboard_cache(shop.id)
    invalidate_insights_cache(shop.id)
    return result


@router.get("", response_model=list[SaleHistoryEntry])
def sale_history(
    days: int = 90,
    shop: ShopContext = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """Line-level sale history — powers the Profit/Revenue drill-down on the
    dashboard, where the owner wants to see every transaction behind a total,
    not just the rolled-up number."""
    return sales_service.list_sale_history(db, shop, days)
