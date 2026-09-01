"""Environment-backed settings for the FastAPI service."""

from dataclasses import dataclass, field
import os


def _frontend_origins() -> list[str]:
    configured_origins = os.getenv("FRONTEND_ORIGINS", "")
    if configured_origins.strip():
        return [
            origin.strip()
            for origin in configured_origins.split(",")
            if origin.strip()
        ]

    return [
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


@dataclass(frozen=True)
class Settings:
    """Runtime configuration loaded from environment variables."""

    backend_host: str = field(
        default_factory=lambda: os.getenv("BACKEND_HOST", "0.0.0.0")
    )
    backend_port: int = field(
        default_factory=lambda: int(os.getenv("BACKEND_PORT", "8000"))
    )
    frontend_origins: list[str] = field(default_factory=_frontend_origins)


settings = Settings()