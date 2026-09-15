"""SQLAlchemy connection helpers for the Farm2Fork PostgreSQL database."""

from functools import lru_cache

from sqlalchemy import Engine, create_engine, text

from ..config import settings


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Create the SQLAlchemy engine from the required application database URL."""

    return create_engine(
        settings.database_url,
        connect_args={"connect_timeout": 10},
        pool_pre_ping=True,
    )


def check_database_connection() -> None:
    """Run a read-only query to verify the PostgreSQL connection."""

    with get_engine().connect() as connection:
        connection.execute(text("SELECT 1"))
