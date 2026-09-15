from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..config import settings
from ..database.connection import get_engine

router = APIRouter(prefix="/api", tags=["market-intelligence"])

DATA_GOV_RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070"
DATA_GOV_URL = f"https://api.data.gov.in/resource/{DATA_GOV_RESOURCE}"
MAX_LIMIT = 100
SYNC_LIMIT = 1000
_sync_lock = asyncio.Lock()
_sync_task: asyncio.Task[int] | None = None
logger = logging.getLogger(__name__)


class MarketUpstreamError(RuntimeError):
    def __init__(self, message: str, category: str = "UNAVAILABLE") -> None:
        super().__init__(message)
        self.category = category


class MarketPriceRecord(BaseModel):
    commodity: str
    variety: str = "Not specified"
    grade: str | None = None
    state: str | None = None
    district: str | None = None
    market: str | None = None
    arrival_date: date | None = None
    min_price: float | None = Field(default=None, ge=0)
    max_price: float | None = Field(default=None, ge=0)
    modal_price: float | None = Field(default=None, ge=0)
    unit: str | None = None
    source: str = "Government of India - data.gov.in"
    fetched_at: datetime


class MarketPricesResponse(BaseModel):
    records: list[MarketPriceRecord]
    total: int | None = None
    limit: int
    offset: int
    source: str = "Government of India - data.gov.in"
    fetched_at: datetime
    stale: bool = False


class CropCatalogItem(BaseModel):
    id: str
    name: str
    normalized_name: str
    source_commodity: str
    category: str
    last_synced_at: datetime


class CropVarietyItem(BaseModel):
    id: str
    name: str


class MarketHistoryResponse(BaseModel):
    commodity: str
    variety: str | None = None
    observations: list[MarketPriceRecord]
    available_from: date | None = None
    available_to: date | None = None
    message: str | None = None
    source: str = "Government of India - data.gov.in"


class MarketCacheStatus(BaseModel):
    status: str
    last_success_at: datetime | None = None
    last_attempt_at: datetime | None = None
    records_imported: int = 0
    upstream_status: str = "NOT_SYNCED"
    cooldown_until: datetime | None = None
    last_error_category: str | None = None


DISPLAY_COMMODITIES = {
    "ridgeguard(tori)": "Ridge Gourd / Tori",
    "ground nut seed": "Groundnut",
    "jowar(sorghum)": "Jowar / Sorghum",
}


def _normalized_name(value: str) -> str:
    return " ".join("".join(char.lower() if char.isalnum() else " " for char in value).split())


def _display_commodity(value: str) -> str:
    return DISPLAY_COMMODITIES.get(_normalized_name(value), value.strip())


def _category(commodity: str) -> str:
    # Conservative grouping: unknown official commodity names deliberately remain Other.
    words = set(_normalized_name(commodity).split())
    if words & {"rice", "wheat", "maize", "jowar", "bajra", "barley"}: return "Cereals"
    if words & {"gram", "lentil", "moong", "urad", "arhar", "pea"}: return "Pulses"
    if words & {"groundnut", "mustard", "sesamum", "sunflower", "soyabean", "soybean"}: return "Oilseeds"
    if words & {"potato", "tomato", "onion", "brinjal", "cabbage", "cauliflower", "gourd", "okra"}: return "Vegetables"
    if words & {"mango", "banana", "apple", "grapes", "pomegranate", "orange"}: return "Fruits"
    if words & {"chilli", "turmeric", "coriander", "ginger", "garlic", "pepper"}: return "Spices"
    return "Other"


def _official_variety(value: Any) -> str:
    """Only maps values observed in the official variety field; it never derives from commodity."""
    actual = _text(value)
    if actual is None:
        return "Not specified"
    return "Other / Not specified" if _normalized_name(actual) == "other" else actual


def _first_value(row: dict[str, Any], *names: str) -> Any:
    for name in names:
        value = row.get(name)
        if value is not None and str(value).strip() != "":
            return value
    return None


def _text(value: Any) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _number(value: Any) -> float | None:
    if value is None:
        return None
    cleaned = str(value).strip().replace(",", "")
    if not cleaned or cleaned.lower() in {"na", "n/a", "null", "-"}:
        return None
    try:
        parsed = float(cleaned)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _date_value(value: Any) -> date | None:
    if value is None:
        return None
    text = str(value).strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d %b %Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _normalize_record(row: Any, fetched_at: datetime) -> MarketPriceRecord | None:
    if not isinstance(row, dict):
        return None
    commodity = _text(_first_value(row, "Commodity", "commodity", "commodity_name"))
    if not commodity:
        return None
    return MarketPriceRecord(
        commodity=commodity,
        variety=_official_variety(_first_value(row, "Variety", "variety")),
        grade=_text(_first_value(row, "Grade", "grade")),
        state=_text(_first_value(row, "State", "state")),
        district=_text(_first_value(row, "District", "district")),
        market=_text(_first_value(row, "Market", "market", "Mandi", "mandi")),
        arrival_date=_date_value(_first_value(row, "Arrival_Date", "arrival_date", "Arrival Date")),
        min_price=_number(_first_value(row, "Min_Price", "min_price", "Min Price")),
        max_price=_number(_first_value(row, "Max_Price", "max_price", "Max Price")),
        modal_price=_number(_first_value(row, "Modal_Price", "modal_price", "Modal Price")),
        unit=_text(_first_value(row, "Price_Unit", "price_unit", "Unit", "unit")),
        fetched_at=fetched_at,
    )


def _query_key(*values: Any) -> str:
    return "|".join(str(value or "").strip().lower() for value in values)


def _data_gov_params(
    commodity: str | None,
    variety: str | None,
    state: str | None,
    district: str | None,
    market: str | None,
    limit: int,
    offset: int,
) -> dict[str, str | int]:
    params: dict[str, str | int] = {
        "api-key": settings.market_data_gov_api_key,
        "format": "json",
        "limit": limit,
        "offset": offset,
    }
    for field, value in (
        ("commodity", commodity),
        ("variety", variety),
        ("state", state),
        ("district", district),
        ("market", market),
    ):
        if value and value.strip():
            params[f"filters[{field}]"] = value.strip()
    return params


async def _fetch_prices(
    commodity: str | None,
    variety: str | None,
    state: str | None,
    district: str | None,
    market: str | None,
    date_from: date | None,
    date_to: date | None,
    limit: int,
    offset: int,
) -> MarketPricesResponse:
    fetched_at = datetime.now(timezone.utc)
    if not settings.market_data_gov_api_key:
        raise MarketUpstreamError("Official market data is not configured on the backend.", "CONFIGURATION")
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=5.0),
            headers={"Accept": "application/json", "User-Agent": "Farm2Fork/1.0"},
        ) as client:
            response = await client.get(
                DATA_GOV_URL,
                params=_data_gov_params(commodity, variety, state, district, market, limit, offset),
            )
    except httpx.TimeoutException as error:
        raise MarketUpstreamError("The government market data service timed out.", "TIMEOUT") from error
    except httpx.RequestError as error:
        raise MarketUpstreamError("The government market data service is unavailable.", "UNAVAILABLE") from error

    if response.status_code in {401, 403}:
        logger.warning("data.gov.in market request rejected with status %s", response.status_code)
        raise MarketUpstreamError("The government market data service rejected the backend credentials.", "UNAUTHORIZED")
    if response.status_code == 429:
        logger.warning("data.gov.in market request rate limited")
        raise MarketUpstreamError("The government market data service is rate limited.", "RATE_LIMITED")
    if response.status_code >= 500:
        logger.warning("data.gov.in market request failed upstream with status %s", response.status_code)
        raise MarketUpstreamError("The government market data service is temporarily unavailable.", "UPSTREAM_ERROR")
    if response.status_code >= 400:
        raise MarketUpstreamError("The government market data service rejected the request.", "UPSTREAM_ERROR")
    try:
        payload = response.json()
    except ValueError as error:
        raise MarketUpstreamError("The government market data response was malformed.", "MALFORMED") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("records"), list):
        raise MarketUpstreamError("The government market data response did not contain records.", "MALFORMED")

    records: list[MarketPriceRecord] = []
    for row in payload["records"]:
        try:
            normalized = _normalize_record(row, fetched_at)
        except (TypeError, ValueError):
            normalized = None
        if normalized is not None:
            if date_from and normalized.arrival_date and normalized.arrival_date < date_from:
                continue
            if date_to and normalized.arrival_date and normalized.arrival_date > date_to:
                continue
            records.append(normalized)
    result = MarketPricesResponse(
        records=records,
        total=payload.get("total"),
        limit=limit,
        offset=offset,
        fetched_at=fetched_at,
    )
    _persist_observations(records, fetched_at)
    return result


def _persist_observations(records: list[MarketPriceRecord], fetched_at: datetime) -> None:
    """Best-effort, idempotent cache sync. A database outage must not hide live official prices."""
    if not records:
        return
    try:
        with get_engine().begin() as connection:
            for record in records:
                normalized = _normalized_name(record.commodity)
                crop_id = connection.execute(text("""
                    INSERT INTO public.crops(name, normalized_name, source_commodity, category, last_synced_at)
                    VALUES (:name, :normalized_name, :source_commodity, :category, :synced)
                    ON CONFLICT (normalized_name) DO UPDATE SET
                      name = EXCLUDED.name, source_commodity = EXCLUDED.source_commodity,
                      category = EXCLUDED.category, last_synced_at = EXCLUDED.last_synced_at, updated_at = now()
                    RETURNING id
                """), {"name": _display_commodity(record.commodity), "normalized_name": normalized,
                       "source_commodity": record.commodity, "category": _category(record.commodity), "synced": fetched_at}).scalar_one()
                variety_id = None
                if record.variety != "Not specified":
                    source_variety = record.variety
                    display_variety = source_variety
                    variety_id = connection.execute(text("""
                        INSERT INTO public.crop_varieties(crop_id, name, normalized_name, source, source_variety)
                        VALUES (:crop_id, :name, :normalized_name, 'DATA_GOV_IN', :source_variety)
                        ON CONFLICT (crop_id, normalized_name, source) DO UPDATE SET name=EXCLUDED.name, source_variety=EXCLUDED.source_variety, updated_at=now()
                        RETURNING id
                    """), {"crop_id": crop_id, "name": display_variety, "normalized_name": _normalized_name(source_variety), "source_variety": source_variety}).scalar_one()
                fingerprint = "|".join(str(value or "") for value in (record.commodity, record.variety, record.state, record.district, record.market, record.arrival_date, record.grade, record.min_price, record.max_price, record.modal_price, record.unit))
                connection.execute(text("""
                    INSERT INTO public.market_prices(crop_id, variety_id, source_commodity, source_variety, state, district, market, grade, arrival_date, min_price, max_price, modal_price, unit, source_record_hash, source_updated_at)
                    VALUES (:crop_id, :variety_id, :commodity, :variety, :state, :district, :market, :grade, :arrival_date, :min_price, :max_price, :modal_price, :unit, :hash, :synced)
                    ON CONFLICT (source_record_hash) DO UPDATE SET source_updated_at=EXCLUDED.source_updated_at, updated_at=now()
                """), {"crop_id": crop_id, "variety_id": variety_id, "commodity": record.commodity, "variety": record.variety,
                           "state": record.state, "district": record.district, "market": record.market, "grade": record.grade, "arrival_date": record.arrival_date,
                           "min_price": record.min_price, "max_price": record.max_price, "modal_price": record.modal_price, "unit": record.unit,
                           "hash": hashlib.sha256(fingerprint.encode()).hexdigest(), "synced": fetched_at})
    except Exception as error:
        logger.warning("market cache sync skipped: %s", error)


def _sync_status() -> dict[str, Any]:
    try:
        with get_engine().connect() as connection:
            row = connection.execute(text("SELECT * FROM public.market_sync_status WHERE id = true")).mappings().one_or_none()
        return dict(row) if row else {}
    except Exception:
        return {}


def _set_sync_status(**values: Any) -> None:
    if not values:
        return
    assignments = ", ".join(f"{key} = :{key}" for key in values)
    try:
        with get_engine().begin() as connection:
            connection.execute(text(f"UPDATE public.market_sync_status SET {assignments}, updated_at = now() WHERE id = true"), values)
    except Exception as error:
        logger.warning("could not update market sync status: %s", error)


async def _run_sync() -> int:
    status_row = _sync_status()
    now = datetime.now(timezone.utc)
    cooldown_until = status_row.get("cooldown_until")
    if cooldown_until and cooldown_until > now:
        raise MarketUpstreamError("Government market data is temporarily rate limited.", "RATE_LIMITED")
    last_attempt = status_row.get("last_attempt_at")
    if last_attempt and (now - last_attempt).total_seconds() < settings.market_data_min_refresh_seconds:
        return 0
    _set_sync_status(last_attempt_at=now, upstream_status="SYNCING", last_error_category=None)
    try:
        # One broad backend-only snapshot powers all user filters; user query parameters never reach data.gov.in.
        result = await _fetch_prices(None, None, None, None, None, None, None, SYNC_LIMIT, 0)
    except MarketUpstreamError as error:
        if error.category == "RATE_LIMITED":
            failures = int(status_row.get("rate_limit_count") or 0) + 1
            cooldown = min(settings.market_data_rate_limit_cooldown_seconds * (2 ** (failures - 1)), settings.market_data_max_cooldown_seconds)
            _set_sync_status(upstream_status="RATE_LIMITED", rate_limit_count=failures, cooldown_until=now + timedelta(seconds=cooldown), last_error_category=error.category)
        else:
            _set_sync_status(upstream_status="ERROR", last_error_category=error.category)
        raise
    _set_sync_status(last_success_at=now, records_imported=len(result.records), upstream_status="AVAILABLE", rate_limit_count=0, cooldown_until=None, last_error_category=None)
    return len(result.records)


async def _ensure_sync(background: bool) -> None:
    global _sync_task
    async with _sync_lock:
        if _sync_task is None or _sync_task.done():
            _sync_task = asyncio.create_task(_run_sync())
        task = _sync_task
    if not background:
        await task


def _cached_prices(
    commodity: str | None, variety: str | None, state: str | None, district: str | None,
    market: str | None, date_from: date | None, date_to: date | None, limit: int, offset: int,
) -> MarketPricesResponse:
    clauses = ["1=1"]
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    for column, value in (("source_commodity", commodity), ("state", state), ("district", district), ("market", market)):
        if value:
            clauses.append(f"{column} ILIKE :{column}")
            params[column] = value
    if variety:
        if variety == "Not specified":
            clauses.append("(source_variety IS NULL OR btrim(source_variety) = '' OR source_variety = 'Not specified')")
        elif variety == "Other / Not specified":
            clauses.append("(source_variety ILIKE 'Other' OR source_variety ILIKE 'Other / Not specified')")
        else:
            clauses.append("source_variety ILIKE :source_variety")
            params["source_variety"] = variety
    if date_from: clauses.append("arrival_date >= :date_from"); params["date_from"] = date_from
    if date_to: clauses.append("arrival_date <= :date_to"); params["date_to"] = date_to
    where = " AND ".join(clauses)
    try:
        with get_engine().connect() as connection:
            rows = connection.execute(text(f"""SELECT source_commodity, source_variety, state, district, market, grade, arrival_date, min_price, max_price, modal_price, unit, source, source_updated_at FROM public.market_prices WHERE {where} ORDER BY arrival_date DESC NULLS LAST LIMIT :limit OFFSET :offset"""), params).mappings().all()
            total = connection.execute(text(f"SELECT count(*) FROM public.market_prices WHERE {where}"), params).scalar_one()
    except Exception:
        rows, total = [], 0
    sync = _sync_status()
    fetched_at = sync.get("last_success_at") or datetime.now(timezone.utc)
    records = [MarketPriceRecord(commodity=row["source_commodity"], variety=_official_variety(row["source_variety"]), grade=row["grade"], state=row["state"], district=row["district"], market=row["market"], arrival_date=row["arrival_date"], min_price=row["min_price"], max_price=row["max_price"], modal_price=row["modal_price"], unit=row["unit"], source=row["source"], fetched_at=row["source_updated_at"] or fetched_at) for row in rows]
    stale = not sync.get("last_success_at") or (datetime.now(timezone.utc) - fetched_at).total_seconds() >= settings.market_data_cache_ttl_seconds
    return MarketPricesResponse(records=records, total=total, limit=limit, offset=offset, fetched_at=fetched_at, stale=stale)


async def _database_first_prices(*args: Any) -> MarketPricesResponse:
    cached = _cached_prices(*args)
    if cached.records:
        if cached.stale:
            await _ensure_sync(background=True)
        return cached
    # A valid cache with no matching rows is a legitimate empty result, never a reason to
    # turn each filter/search interaction into an upstream request.
    try:
        with get_engine().connect() as connection:
            cache_exists = bool(connection.execute(text("SELECT EXISTS (SELECT 1 FROM public.market_prices)")).scalar())
    except Exception:
        cache_exists = False
    if cache_exists:
        return cached
    # Bootstrapping is single-flight. Once populated, all requests stay database-only.
    await _ensure_sync(background=False)
    cached = _cached_prices(*args)
    if not cached.records:
        raise MarketUpstreamError("No official market data is available for this selection.", "NO_DATA")
    return cached


@router.get("/market/prices", response_model=MarketPricesResponse)
async def get_market_prices(
    commodity: str | None = Query(default=None, max_length=120),
    variety: str | None = Query(default=None, max_length=120),
    state: str | None = Query(default=None, max_length=120),
    district: str | None = Query(default=None, max_length=120),
    market: str | None = Query(default=None, max_length=160),
    limit: int = Query(default=25, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> MarketPricesResponse:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be before date_to")
    try:
        return await _database_first_prices(
            commodity, variety, state, district, market, date_from, date_to, limit, offset
        )
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/market/crops", response_model=list[CropCatalogItem])
async def get_crop_catalog(
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[CropCatalogItem]:
    """Discover only locally synchronized official commodities; selector traffic never hits upstream."""
    try:
        with get_engine().connect() as connection:
            rows = connection.execute(text("""
                SELECT c.normalized_name, c.name, c.source_commodity, c.category, c.last_synced_at
                FROM public.crops c
                WHERE (:search IS NULL OR c.name ILIKE :pattern OR c.source_commodity ILIKE :pattern)
                ORDER BY c.name LIMIT :limit
            """), {"search": search, "pattern": f"%{search}%" if search else None, "limit": limit}).mappings().all()
    except Exception:
        rows = []
    if not rows:
        try:
            await _ensure_sync(background=False)
        except MarketUpstreamError as error:
            raise HTTPException(status_code=503, detail="Government market data is temporarily unavailable.") from error
        try:
            with get_engine().connect() as connection:
                rows = connection.execute(text("""
                    SELECT c.normalized_name, c.name, c.source_commodity, c.category, c.last_synced_at
                    FROM public.crops c
                    WHERE (:search IS NULL OR c.name ILIKE :pattern OR c.source_commodity ILIKE :pattern)
                    ORDER BY c.name LIMIT :limit
                """), {"search": search, "pattern": f"%{search}%" if search else None, "limit": limit}).mappings().all()
        except Exception:
            rows = []
        if not rows:
            return []
    return [CropCatalogItem(id=row["normalized_name"], name=row["name"], normalized_name=row["normalized_name"], source_commodity=row["source_commodity"], category=row["category"], last_synced_at=row["last_synced_at"] or datetime.now(timezone.utc)) for row in rows]


@router.get("/market/crops/{crop_id}/varieties", response_model=list[CropVarietyItem])
async def get_crop_varieties(crop_id: str) -> list[CropVarietyItem]:
    try:
        with get_engine().connect() as connection:
            rows = connection.execute(text("""
                SELECT v.id, v.name FROM public.crop_varieties v JOIN public.crops c ON c.id = v.crop_id
                WHERE c.normalized_name = :crop_id ORDER BY v.name
            """), {"crop_id": _normalized_name(crop_id)}).mappings().all()
    except Exception:
        rows = []
    if not rows:
        raise HTTPException(status_code=404, detail="No synchronized official varieties were found for this crop.")
    return [CropVarietyItem(id=str(row["id"]), name=row["name"]) for row in rows]

@router.get("/market/history", response_model=MarketHistoryResponse)
async def get_market_history(
    commodity: str = Query(min_length=1, max_length=120),
    variety: str | None = Query(default=None, max_length=120),
    state: str | None = Query(default=None, max_length=120),
    district: str | None = Query(default=None, max_length=120),
    market: str | None = Query(default=None, max_length=160),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
) -> MarketHistoryResponse:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be before date_to")
    clauses = ["source_commodity ILIKE :commodity"]
    params: dict[str, Any] = {"commodity": commodity, "limit": limit}
    for column, value in (("state", state), ("district", district), ("market", market)):
        if value:
            clauses.append(f"{column} ILIKE :{column}")
            params[column] = value
    if variety:
        if variety == "Not specified":
            clauses.append("(source_variety IS NULL OR btrim(source_variety) = '' OR source_variety = 'Not specified')")
        elif variety == "Other / Not specified":
            clauses.append("(source_variety ILIKE 'Other' OR source_variety ILIKE 'Other / Not specified')")
        else:
            clauses.append("source_variety ILIKE :source_variety")
            params["source_variety"] = variety
    if date_from:
        clauses.append("arrival_date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        clauses.append("arrival_date <= :date_to")
        params["date_to"] = date_to
    try:
        with get_engine().connect() as connection:
            rows = connection.execute(text(f"""
                SELECT source_commodity, source_variety, state, district, market, grade, arrival_date,
                       min_price, max_price, modal_price, unit, source, created_at
                FROM public.market_prices WHERE {' AND '.join(clauses)}
                ORDER BY arrival_date ASC NULLS LAST LIMIT :limit
            """), params).mappings().all()
    except Exception as error:
        logger.warning("market history unavailable: %s", error)
        raise HTTPException(status_code=503, detail="Official historical market data has not been synchronized yet.") from error
    observations = [MarketPriceRecord(commodity=row["source_commodity"], variety=_official_variety(row["source_variety"]), grade=row["grade"], state=row["state"], district=row["district"], market=row["market"], arrival_date=row["arrival_date"], min_price=row["min_price"], max_price=row["max_price"], modal_price=row["modal_price"], unit=row["unit"], source=row["source"], fetched_at=row["created_at"]) for row in rows]
    dates = [item.arrival_date for item in observations if item.arrival_date]
    message = None if observations else "No official history is available for this crop/market through the connected source."
    if date_from and (date.today() - date_from).days > 365 * 5 and not observations:
        message = "Five-year official history is not available for this crop/market through the connected source."
    return MarketHistoryResponse(commodity=commodity, variety=variety, observations=observations, available_from=min(dates) if dates else None, available_to=max(dates) if dates else None, message=message)


@router.get("/market/status", response_model=MarketCacheStatus)
async def get_market_cache_status() -> MarketCacheStatus:
    """Operational metadata only; deliberately excludes credentials and raw upstream errors."""
    status_row = _sync_status()
    return MarketCacheStatus(
        status="Cached data available" if status_row.get("last_success_at") else "No cached data",
        last_success_at=status_row.get("last_success_at"), last_attempt_at=status_row.get("last_attempt_at"),
        records_imported=int(status_row.get("records_imported") or 0), upstream_status=status_row.get("upstream_status") or "NOT_SYNCED",
        cooldown_until=status_row.get("cooldown_until"), last_error_category=status_row.get("last_error_category"),
    )


@router.get("/insights", response_model=dict)
async def get_market_insights() -> dict[str, Any]:
    try:
        result = await _database_first_prices(None, None, None, None, None, None, None, 25, 0)
    except RuntimeError as error:
        return {
            "crop": "Market data unavailable",
            "demand": "Unavailable",
            "demandScore": 0,
            "estimatedPrice": 0,
            "priceUnit": "₹ / quintal",
            "priceChange": 0,
            "recommendation": str(error),
            "seasonality": [],
        }
    priced = [record for record in result.records if record.modal_price is not None]
    if not priced:
        return {
            "crop": "Market data unavailable",
            "demand": "Unavailable",
            "demandScore": 0,
            "estimatedPrice": 0,
            "priceUnit": "₹ / quintal",
            "priceChange": 0,
            "recommendation": "No current government market records were returned.",
            "seasonality": [],
        }
    latest = priced[0]
    return {
        "crop": latest.commodity,
        "demand": "Government reference available",
        "demandScore": 0,
        "estimatedPrice": latest.modal_price,
        "priceUnit": latest.unit or "₹ / quintal",
        "priceChange": 0,
        "recommendation": "Government market reference price. This is indicative and is not a guaranteed negotiated price.",
        "seasonality": [],
    }
