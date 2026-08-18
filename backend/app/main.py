from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import dashboard, items, purchases, reports, sales, shops

settings = get_settings()

app = FastAPI(title="Inventory & Cost Management API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(shops.router)
app.include_router(items.router)
app.include_router(purchases.router)
app.include_router(sales.router)
app.include_router(dashboard.router)
app.include_router(reports.router)


@app.get("/health")
def health():
    return {"status": "ok"}
