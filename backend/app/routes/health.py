"""Health-check route."""

import logging

from fastapi import APIRouter
from fastapi import HTTPException

from ..database.connection import check_database_connection
from ..schemas.health import DatabaseHealthResponse, HealthResponse


router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="Farm2Fork backend running")


@router.get("/health/db", response_model=DatabaseHealthResponse)
def database_health() -> DatabaseHealthResponse:
    try:
        check_database_connection()
    except Exception as exc:
        error_type = type(exc).__name__
        logger.error(
            "PostgreSQL health check failed (error_type=%s)",
            error_type,
        )
        raise HTTPException(
            status_code=503,
            detail=f"PostgreSQL connection failed (error_type={error_type})",
        ) from None

    return DatabaseHealthResponse(status="ok", database="connected")
