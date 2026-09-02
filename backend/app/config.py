"""Environment-backed settings for the FastAPI service."""

from dataclasses import dataclass, field
import os


def _required_supabase_database_url() -> str:
    database_url = os.getenv("SUPABASE_DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError(
            "SUPABASE_DATABASE_URL is required; refusing to use DATABASE_URL "
            "or Replit PostgreSQL."
        )

    if not database_url.startswith(
        ("postgresql://", "postgres://", "postgresql+psycopg2://")
    ):
        raise RuntimeError(
            "SUPABASE_DATABASE_URL must be a PostgreSQL SQLAlchemy connection URL."
        )

    return database_url


def _required_supabase_url() -> str:
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is required for Supabase Auth verification.")

    if not supabase_url.startswith(("https://", "http://")):
        raise RuntimeError("SUPABASE_URL must be an HTTP(S) URL.")

    return supabase_url


def _required_supabase_anon_key() -> str:
    anon_key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if not anon_key:
        raise RuntimeError(
            "SUPABASE_ANON_KEY is required for Supabase Auth verification."
        )
    return anon_key


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
    supabase_database_url: str = field(
        default_factory=_required_supabase_database_url
    )
    supabase_url: str = field(default_factory=_required_supabase_url)
    supabase_anon_key: str = field(default_factory=_required_supabase_anon_key)


settings = Settings()