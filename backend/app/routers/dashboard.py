from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..deps import get_current_shop
from ..schemas import DashboardOut
from ..services.analytics import build_dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def get_dashboard(
    days: int = 30,
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    return build_dashboard(db, shop, days)
