"""FastAPI application entry point for Farm2Fork."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routes.health import router as health_router


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