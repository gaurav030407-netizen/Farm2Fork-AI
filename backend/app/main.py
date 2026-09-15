"""FastAPI application entry point for Farm2Fork."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routes.calls import router as calls_router
from .routes.messages import router as messages_router
from .routes.profile import router as profile_router
from .routes.health import router as health_router
from .routes.listings import public_router as public_listings_router
from .routes.listings import router as listings_router
from .routes.market_intelligence import router as market_intelligence_router
from .routes.orders import farmer_router as farmer_orders_router
from .routes.orders import router as orders_router
from .routes.driver import router as driver_router
from .routes.payments import router as payments_router
from .routes.admin import public_router as public_content_router
from .routes.admin import router as admin_router


app = FastAPI(
    title="Farm2Fork Backend",
    description="Backend services for the Farm2Fork marketplace.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(listings_router)
app.include_router(public_listings_router)
app.include_router(market_intelligence_router)
app.include_router(orders_router)
app.include_router(farmer_orders_router)
app.include_router(calls_router)
app.include_router(messages_router)
app.include_router(profile_router)
app.include_router(driver_router)
app.include_router(payments_router)
app.include_router(admin_router)
app.include_router(public_content_router)
