from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import bills, dashboard, insights, items, purchases, sales, shops

settings = get_settings()

app = FastAPI(title="Inventory & Cost Management API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")
api_router.include_router(shops.router)
api_router.include_router(items.router)
api_router.include_router(purchases.router)
api_router.include_router(sales.router)
api_router.include_router(dashboard.router)
api_router.include_router(insights.router)
api_router.include_router(bills.router)


@api_router.get("/health")
def health():
    # Reports whether bill scanning is configured so the frontend can hide the
    # scan button on a deployment without an API key, rather than offering a
    # control that always fails.
    return {"status": "ok", "bill_scanning": settings.bill_scanning_enabled}


app.include_router(api_router)
