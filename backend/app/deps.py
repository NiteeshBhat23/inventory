import time
import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from . import models
from .auth import get_current_shop_id
from .db import get_db


@dataclass(frozen=True)
class ShopContext:
    """The handful of shop fields the request path actually reads.

    Every authenticated endpoint used to spend a full round trip re-SELECTing
    the shop row before the handler could start — ~65ms of pure latency on
    every request, to fetch four values that change roughly never. This is a
    plain snapshot of those values so it can be cached safely: it is detached
    from the session, so there is no risk of a handler mutating it and
    silently expecting a flush.
    """

    id: uuid.UUID
    name: str
    default_target_margin_pct: float
    default_low_stock_threshold: float


# Warm-instance cache. On Vercel Fluid compute the function instance is kept
# alive between requests (it scales to one rather than to zero), so a
# module-level cache genuinely survives and pays off. The TTL bounds staleness
# if the row is ever changed out of band; in-app edits invalidate explicitly.
_SHOP_CACHE: dict[uuid.UUID, tuple[float, ShopContext]] = {}
_SHOP_CACHE_TTL_SECONDS = 300


def invalidate_shop_cache(shop_id: uuid.UUID) -> None:
    _SHOP_CACHE.pop(shop_id, None)


def _load_shop_row(db: Session, shop_id: uuid.UUID) -> models.Shop:
    shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No shop profile yet — call POST /shops to create one first.",
        )
    return shop


def get_current_shop(
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: Session = Depends(get_db),
) -> ShopContext:
    """Cached shop snapshot — the dependency for every read/write path that
    only needs the shop's id and defaults (i.e. all of them except the shop
    profile endpoints themselves)."""
    cached = _SHOP_CACHE.get(shop_id)
    if cached and (time.time() - cached[0]) < _SHOP_CACHE_TTL_SECONDS:
        return cached[1]

    shop = _load_shop_row(db, shop_id)
    ctx = ShopContext(
        id=shop.id,
        name=shop.name,
        default_target_margin_pct=float(shop.default_target_margin_pct),
        default_low_stock_threshold=float(shop.default_low_stock_threshold),
    )
    _SHOP_CACHE[shop_id] = (time.time(), ctx)
    return ctx


def get_current_shop_row(
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: Session = Depends(get_db),
) -> models.Shop:
    """Live, session-attached shop row — only for the endpoints that read or
    mutate the profile itself and therefore must not see a cached copy."""
    return _load_shop_row(db, shop_id)
