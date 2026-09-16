"""Environment-backed settings for the FastAPI service."""

from dataclasses import dataclass, field
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment files
_api_env = Path(__file__).resolve().parent.parent.parent / "artifacts" / "api-server" / ".env"
if _api_env.exists():
    load_dotenv(_api_env)
_backend_env = Path(__file__).resolve().parent.parent / ".env"
if _backend_env.exists():
    load_dotenv(_backend_env, override=True)


def _required_database_url() -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for the PostgreSQL connection.")

    if not database_url.startswith(
        ("postgresql://", "postgres://", "postgresql+psycopg2://")
    ):
        raise RuntimeError(
            "DATABASE_URL must be a PostgreSQL SQLAlchemy connection URL."
        )

    return database_url


def _required_jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET", "").strip()
    if len(secret) < 32:
        raise RuntimeError("JWT_SECRET must be a strong value of at least 32 characters.")
    return secret


def _optional_storage_url() -> str:
    return os.getenv("SUPABASE_URL", "").strip().rstrip("/")


def _optional_storage_key() -> str:
    return os.getenv("SUPABASE_ANON_KEY", "").strip()


def _optional_storage_service_role_key() -> str:
    return os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()


def _optional_market_data_gov_api_key() -> str:
    return os.getenv("MARKET_DATA_GOV_API_KEY", "").strip()


def _optional_env(name: str) -> str:
    return os.getenv(name, "").strip()


def _positive_int_env(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default))))
    except ValueError:
        return default


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
    database_url: str = field(default_factory=_required_database_url)
    jwt_secret: str = field(default_factory=_required_jwt_secret)
    jwt_algorithm: str = field(default_factory=lambda: os.getenv("JWT_ALGORITHM", "HS256"))
    supabase_url: str = field(default_factory=_optional_storage_url)
    supabase_anon_key: str = field(default_factory=_optional_storage_key)
    supabase_service_role_key: str = field(default_factory=_optional_storage_service_role_key)
    market_data_gov_api_key: str = field(default_factory=_optional_market_data_gov_api_key)
    payment_gateway: str = field(default_factory=lambda: _optional_env("PAYMENT_GATEWAY"))
    payment_key_id: str = field(default_factory=lambda: _optional_env("PAYMENT_KEY_ID"))
    payment_key_secret: str = field(default_factory=lambda: _optional_env("PAYMENT_KEY_SECRET"))
    payment_webhook_secret: str = field(default_factory=lambda: _optional_env("PAYMENT_WEBHOOK_SECRET"))
    market_data_cache_ttl_seconds: int = field(default_factory=lambda: _positive_int_env("MARKET_DATA_CACHE_TTL_SECONDS", 1800))
    market_data_min_refresh_seconds: int = field(default_factory=lambda: _positive_int_env("MARKET_DATA_MIN_REFRESH_SECONDS", 60))
    market_data_rate_limit_cooldown_seconds: int = field(default_factory=lambda: _positive_int_env("MARKET_DATA_RATE_LIMIT_COOLDOWN_SECONDS", 300))
    market_data_max_cooldown_seconds: int = field(default_factory=lambda: _positive_int_env("MARKET_DATA_MAX_COOLDOWN_SECONDS", 3600))
    ai_provider: str = field(default_factory=lambda: os.getenv("AI_PROVIDER", "gemini").strip().lower() or "gemini")
    gemini_api_key: str = field(default_factory=lambda: _optional_env("GEMINI_API_KEY"))
    gemini_model: str = field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash")
    ai_timeout_seconds: int = field(default_factory=lambda: _positive_int_env("AI_TIMEOUT_SECONDS", 20))
    ai_max_output_tokens: int = field(default_factory=lambda: _positive_int_env("AI_MAX_OUTPUT_TOKENS", 1024))
    ai_max_requests_per_minute: int = field(default_factory=lambda: _positive_int_env("AI_MAX_REQUESTS_PER_MINUTE", 30))
    ollama_base_url: str = field(default_factory=lambda: os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").strip().rstrip("/") or "http://127.0.0.1:11434")
    ollama_model: str = field(default_factory=lambda: os.getenv("OLLAMA_MODEL", "farm2fork").strip() or "farm2fork")


settings = Settings()
