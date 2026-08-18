import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from . import models
from .auth import get_current_shop_id
from .db import get_db


def get_current_shop(
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: Session = Depends(get_db),
) -> models.Shop:
    shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No shop profile yet — call POST /shops to create one first.",
        )
    return shop
