from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..auth import AuthenticatedUser, get_current_user
from ..config import settings
from ..database.connection import get_engine
from .market_intelligence import (
    _ensure_sync,
    _normalized_name,
    _sync_status,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])
public_router = APIRouter(prefix="/api", tags=["content-and-reports"])


def _require_admin(user: AuthenticatedUser) -> None:
    if user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Administrator permission is required.")


async def _signed_media_url(storage_key: str | None) -> str | None:
    if not storage_key or not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    safe_path = str(PurePosixPath(storage_key))
    if safe_path != storage_key or safe_path.startswith("/") or ".." in PurePosixPath(storage_key).parts:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                f"{settings.supabase_url}/storage/v1/object/sign/crop-media/{safe_path}",
                headers={
                    "apikey": settings.supabase_service_role_key,
                    "Authorization": f"Bearer {settings.supabase_service_role_key}",
                    "Content-Type": "application/json",
                },
                json={"expiresIn": 3600},
            )
        if response.status_code != 200:
            return None
        signed = response.json().get("signedURL")
        if not isinstance(signed, str):
            return None
        if signed.startswith("http"):
            return signed
        return f"{settings.supabase_url}/storage/v1{signed if signed.startswith('/') else '/' + signed}"
    except (httpx.RequestError, ValueError):
        return None


# --- Pydantic Schemas ---

class UserStatusDecision(BaseModel):
    account_status: str
    reason: str | None = Field(default=None, max_length=500)


class DriverDecision(BaseModel):
    approval_status: str
    reason: str | None = Field(default=None, max_length=500)


class ListingDecision(BaseModel):
    status: str
    reason: str | None = Field(default=None, max_length=500)


class MediaDecision(BaseModel):
    moderation_status: str


class ContentInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    short_description: str | None = Field(default=None, max_length=500)
    content: str = Field(min_length=1, max_length=20000)
    category: str = Field(min_length=1, max_length=80)
    status: str = "DRAFT"
    image_url: str | None = Field(default=None, max_length=1000)
    publish_at: datetime | None = None
    expires_at: datetime | None = None


class CropInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(default="Other", max_length=80)
    is_active: bool = True


class CropVarietyInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    is_active: bool = True


class UserReportInput(BaseModel):
    reason: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=2000)
    reported_profile_id: UUID | None = None
    listing_id: UUID | None = None
    order_id: UUID | None = None


class ReportDecision(BaseModel):
    status: str
    resolution_note: str | None = Field(default=None, max_length=1000)


# --- Public / Authenticated Content & Reporting Routes ---

@public_router.get("/content")
def published_content() -> list[dict]:
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT id, title, short_description, content, category, publish_at, expires_at, created_at
            FROM public.content_items
            WHERE status = 'PUBLISHED'
              AND (publish_at IS NULL OR publish_at <= now())
              AND (expires_at IS NULL OR expires_at > now())
            ORDER BY publish_at DESC NULLS LAST, created_at DESC
            LIMIT 50
        """)).mappings().all()
    return [dict(row) for row in rows]


@public_router.post("/reports")
def submit_report(payload: UserReportInput, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    with get_engine().begin() as connection:
        row = connection.execute(text("""
            INSERT INTO public.user_reports (reporter_id, reported_profile_id, listing_id, order_id, reason, description, status)
            VALUES (:reporter_id, :reported_profile_id, :listing_id, :order_id, :reason, :description, 'OPEN')
            RETURNING id, status, created_at
        """), {
            "reporter_id": user.id,
            "reported_profile_id": payload.reported_profile_id,
            "listing_id": payload.listing_id,
            "order_id": payload.order_id,
            "reason": payload.reason.strip(),
            "description": payload.description.strip(),
        }).mappings().one()
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'USER_REPORT_SUBMITTED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"report_id": str(row["id"]), "reason": payload.reason}),
        })
    return dict(row)


# --- Admin Dashboard ---

@router.get("/dashboard")
def dashboard(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    with get_engine().connect() as connection:
        counts = connection.execute(text("""
            SELECT
              (SELECT count(*) FROM public.profiles WHERE role = 'FARMER' AND account_status = 'ACTIVE') AS farmers,
              (SELECT count(*) FROM public.profiles WHERE role = 'BUYER' AND account_status = 'ACTIVE') AS buyers,
              (SELECT count(*) FROM public.profiles WHERE role = 'CONSUMER' AND account_status = 'ACTIVE') AS consumers,
              (SELECT count(*) FROM public.profiles WHERE role = 'DRIVER' AND account_status = 'ACTIVE') AS drivers,
              (SELECT count(*) FROM public.drivers WHERE approval_status = 'PENDING') AS pending_driver_approvals,
              (SELECT count(*) FROM public.crop_listings) AS listings,
              (SELECT count(*) FROM public.crop_listings WHERE status = 'ACTIVE') AS active_listings,
              (SELECT count(*) FROM public.orders WHERE status NOT IN ('DELIVERED', 'CANCELLED', 'REJECTED')) AS pending_orders,
              (SELECT count(*) FROM public.orders WHERE status = 'DELIVERED') AS completed_orders,
              (SELECT count(*) FROM public.payments WHERE status IN ('CREATED', 'PENDING', 'AUTHORIZED')) AS pending_payments,
              (SELECT count(*) FROM public.payments) AS transactions,
              (SELECT count(*) FROM public.listing_moderation WHERE status = 'FLAGGED') AS flagged_listings,
              (SELECT count(*) FROM public.identity_verifications WHERE status IN ('PENDING', 'REVIEW')) AS verification_requests,
              (SELECT count(*) FROM public.delivery_jobs WHERE status IN ('AVAILABLE', 'ACCEPTED', 'PICKED_UP')) AS active_delivery_jobs
        """)).mappings().one()
    return {key: int(value or 0) for key, value in counts.items()}


# --- Admin User Management ---

@router.get("/users")
def users(
    search: str = "",
    role: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 25,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    _require_admin(user)
    page_size = min(max(page_size, 1), 100)
    offset = max(page - 1, 0) * page_size
    params = {"search": search.strip(), "role": role, "status": status, "limit": page_size, "offset": offset}
    where_clauses = [
        "(:search = '' OR name ILIKE '%' || :search || '%' OR email ILIKE '%' || :search || '%' OR phone_number ILIKE '%' || :search || '%')",
    ]
    if role:
        where_clauses.append("role = :role")
    if status:
        where_clauses.append("account_status = :status")

    where_sql = " AND ".join(where_clauses)
    with get_engine().connect() as connection:
        total = connection.execute(text(f"SELECT count(*) FROM public.profiles WHERE {where_sql}"), params).scalar() or 0
        rows = connection.execute(text(f"""
            SELECT id, name, email, phone_number, role, email_verified, phone_verified, account_status, created_at, suspended_at, suspended_reason
            FROM public.profiles
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """), params).mappings().all()
    return {"items": [dict(row) for row in rows], "total": int(total), "page": page, "page_size": page_size}


@router.patch("/users/{user_id}/status")
def update_user_status(user_id: UUID, payload: UserStatusDecision, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    if payload.account_status not in {"ACTIVE", "SUSPENDED", "DELETED"}:
        raise HTTPException(status_code=422, detail="Invalid account status.")

    with get_engine().begin() as connection:
        target = connection.execute(text("SELECT id, role, account_status FROM public.profiles WHERE id = :user_id"), {"user_id": user_id}).mappings().one_or_none()
        if target is None:
            raise HTTPException(status_code=404, detail="User not found.")

        # Guard: Prevent suspending the last active administrator!
        if target["role"] == "ADMIN" and payload.account_status in {"SUSPENDED", "DELETED"}:
            active_admins = connection.execute(text("SELECT count(*) FROM public.profiles WHERE role = 'ADMIN' AND account_status = 'ACTIVE' AND id != :user_id"), {"user_id": user_id}).scalar() or 0
            if active_admins == 0:
                raise HTTPException(status_code=400, detail="Cannot deactivate the final active administrator account.")

        suspended_at = datetime.now(timezone.utc) if payload.account_status == "SUSPENDED" else None
        deleted_at = datetime.now(timezone.utc) if payload.account_status == "DELETED" else None

        row = connection.execute(text("""
            UPDATE public.profiles
            SET account_status = :account_status,
                suspended_at = :suspended_at,
                suspended_reason = :reason,
                deleted_at = COALESCE(deleted_at, :deleted_at),
                updated_at = now()
            WHERE id = :user_id
            RETURNING id, name, email, role, account_status, suspended_at, suspended_reason
        """), {
            "user_id": user_id,
            "account_status": payload.account_status,
            "suspended_at": suspended_at,
            "reason": payload.reason,
            "deleted_at": deleted_at,
        }).mappings().one()

        event_type = f"USER_{payload.account_status}"
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, :event_type, CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "event_type": event_type,
            "metadata": json.dumps({"target_user_id": str(user_id), "status": payload.account_status, "reason": payload.reason}),
        })

    return dict(row)


# --- Role Workspaces: Farmers, Buyers, Consumers ---

@router.get("/farmers")
def list_farmers(search: str = "", user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT p.id, p.name, p.email, p.phone_number, p.email_verified, p.phone_verified,
                   p.account_status, p.created_at, f.id AS farmer_id, f.farm_name, f.location AS farm_location,
                   f.farm_size, f.farm_size_unit, f.farming_type, f.crops_grown,
                   (SELECT count(*) FROM public.crop_listings cl WHERE cl.farmer_id = f.id) AS listings_count,
                   (SELECT count(*) FROM public.orders o WHERE o.farmer_id = f.id) AS orders_count
            FROM public.profiles p
            JOIN public.farmers f ON f.profile_id = p.id
            WHERE p.role = 'FARMER'
              AND (:search = '' OR p.name ILIKE '%' || :search || '%' OR f.farm_name ILIKE '%' || :search || '%' OR p.email ILIKE '%' || :search || '%')
            ORDER BY p.created_at DESC
            LIMIT 200
        """), {"search": search.strip()}).mappings().all()
    return [dict(row) for row in rows]


@router.get("/buyers")
def list_buyers(search: str = "", user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT p.id, p.name, p.email, p.phone_number, p.email_verified, p.phone_verified,
                   p.account_status, p.created_at, b.id AS buyer_id, b.business_name, b.buyer_type,
                   b.purchasing_interests, b.preferred_crops, b.location,
                   (SELECT count(*) FROM public.orders o WHERE o.buyer_id = b.id) AS orders_count
            FROM public.profiles p
            JOIN public.buyers b ON b.profile_id = p.id
            WHERE p.role = 'BUYER'
              AND (:search = '' OR p.name ILIKE '%' || :search || '%' OR b.business_name ILIKE '%' || :search || '%' OR p.email ILIKE '%' || :search || '%')
            ORDER BY p.created_at DESC
            LIMIT 200
        """), {"search": search.strip()}).mappings().all()
    return [dict(row) for row in rows]


@router.get("/consumers")
def list_consumers(search: str = "", user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT p.id, p.name, p.email, p.phone_number, p.email_verified, p.phone_verified,
                   p.account_status, p.created_at, b.id AS buyer_id, b.delivery_address,
                   (SELECT count(*) FROM public.orders o WHERE o.buyer_id = b.id) AS orders_count
            FROM public.profiles p
            JOIN public.buyers b ON b.profile_id = p.id
            WHERE p.role = 'CONSUMER'
              AND (:search = '' OR p.name ILIKE '%' || :search || '%' OR p.email ILIKE '%' || :search || '%' OR p.phone_number ILIKE '%' || :search || '%')
            ORDER BY p.created_at DESC
            LIMIT 200
        """), {"search": search.strip()}).mappings().all()
    return [dict(row) for row in rows]


# --- Drivers ---

@router.get("/drivers")
def list_drivers(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT d.id, d.profile_id, p.name, p.email, p.phone_number, p.phone_verified,
                   d.service_area, d.vehicle_type, d.vehicle_registration, d.availability_status,
                   d.approval_status, d.created_at, d.updated_at,
                   (SELECT count(*) FROM public.delivery_jobs dj WHERE dj.driver_id = d.id AND dj.status = 'DELIVERED') AS completed_deliveries,
                   (SELECT count(*) FROM public.delivery_jobs dj WHERE dj.driver_id = d.id AND dj.status = 'CANCELLED') AS cancelled_deliveries,
                   (SELECT count(*) FROM public.delivery_jobs dj WHERE dj.driver_id = d.id AND dj.status IN ('ACCEPTED', 'PICKED_UP')) AS active_jobs,
                   COALESCE((SELECT sum(de.amount) FROM public.driver_earnings de WHERE de.driver_id = d.id AND de.status = 'PAID'), 0) AS total_earnings
            FROM public.drivers d
            JOIN public.profiles p ON p.id = d.profile_id
            ORDER BY d.created_at DESC
        """)).mappings().all()
    return [dict(row) for row in rows]


@router.patch("/drivers/{driver_id}")
def decide_driver(driver_id: UUID, payload: DriverDecision, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    if payload.approval_status not in {"APPROVED", "SUSPENDED", "PENDING"}:
        raise HTTPException(status_code=422, detail="Invalid driver approval state.")
    with get_engine().begin() as connection:
        row = connection.execute(text("""
            UPDATE public.drivers
            SET approval_status = :approval_status, updated_at = now()
            WHERE id = :driver_id
            RETURNING id, profile_id, approval_status
        """), {"driver_id": driver_id, "approval_status": payload.approval_status}).mappings().one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Driver not found.")
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'DRIVER_APPROVAL_CHANGED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"driver_id": str(driver_id), "status": payload.approval_status, "reason": payload.reason}),
        })
    return dict(row)


# --- Crop Listings Moderation ---

@router.get("/listings")
async def listings(
    crop: str | None = None,
    status: str | None = None,
    search: str = "",
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[dict]:
    _require_admin(user)
    params = {"search": search.strip(), "crop": crop, "status": status}
    where_clauses = [
        "(:search = '' OR cl.crop_name ILIKE '%' || :search || '%' OR cl.variety ILIKE '%' || :search || '%' OR p.name ILIKE '%' || :search || '%')",
    ]
    if crop:
        where_clauses.append("cl.crop_name ILIKE :crop")
    if status:
        where_clauses.append("COALESCE(lm.status, 'ACTIVE') = :status")

    where_sql = " AND ".join(where_clauses)
    with get_engine().connect() as connection:
        rows = connection.execute(text(f"""
            SELECT cl.id, cl.crop_name, cl.variety, cl.farmer_entered_variety, cl.location,
                   cl.quantity, cl.unit, cl.price, cl.quality, cl.harvest_date, cl.description,
                   cl.image_url, cl.status, cl.created_at, cl.updated_at,
                   p.name AS farmer_name, p.phone_number AS farmer_phone,
                   COALESCE(lm.status, 'ACTIVE') AS moderation_status, lm.reason AS moderation_reason
            FROM public.crop_listings cl
            JOIN public.farmers f ON f.id = cl.farmer_id
            JOIN public.profiles p ON p.id = f.profile_id
            LEFT JOIN public.listing_moderation lm ON lm.listing_id = cl.id
            WHERE {where_sql}
            ORDER BY cl.created_at DESC
            LIMIT 200
        """), params).mappings().all()

    result = []
    for row in rows:
        d = dict(row)
        d["image_url"] = await _signed_media_url(d.get("image_url"))
        result.append(d)
    return result


@router.patch("/listings/{listing_id}")
def moderate_listing(listing_id: UUID, payload: ListingDecision, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    if payload.status not in {"ACTIVE", "FLAGGED", "HIDDEN", "SOLD", "EXPIRED"}:
        raise HTTPException(status_code=422, detail="Invalid moderation status.")
    with get_engine().begin() as connection:
        row = connection.execute(text("""
            INSERT INTO public.listing_moderation (listing_id, status, reason, acted_by)
            VALUES (:listing_id, :status, :reason, :acted_by)
            ON CONFLICT (listing_id) DO UPDATE
            SET status = EXCLUDED.status, reason = EXCLUDED.reason, acted_by = EXCLUDED.acted_by, updated_at = now()
            RETURNING listing_id, status, reason
        """), {"listing_id": listing_id, "status": payload.status, "reason": payload.reason, "acted_by": user.id}).mappings().one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Listing not found.")
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'LISTING_MODERATION_CHANGED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"listing_id": str(listing_id), "status": payload.status, "reason": payload.reason}),
        })
    return dict(row)


# --- Crop & Variety Catalog Admin ---

@router.get("/crops")
def list_crops(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT c.id, c.name, c.normalized_name, c.source_commodity, c.category,
                   c.is_active, c.last_synced_at, c.created_at,
                   (SELECT count(*) FROM public.crop_varieties cv WHERE cv.crop_id = c.id) AS varieties_count
            FROM public.crops c
            ORDER BY c.name ASC
        """)).mappings().all()
    return [dict(row) for row in rows]


@router.post("/crops")
def create_crop(payload: CropInput, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    norm = _normalized_name(payload.name)
    with get_engine().begin() as connection:
        existing = connection.execute(text("SELECT id FROM public.crops WHERE normalized_name = :norm"), {"norm": norm}).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=409, detail="A crop with this name already exists in the catalog.")
        row = connection.execute(text("""
            INSERT INTO public.crops (name, normalized_name, source_commodity, category, is_active)
            VALUES (:name, :normalized_name, :source_commodity, :category, :is_active)
            RETURNING id, name, normalized_name, category, is_active, created_at
        """), {
            "name": payload.name.strip(),
            "normalized_name": norm,
            "source_commodity": payload.name.strip(),
            "category": payload.category.strip(),
            "is_active": payload.is_active,
        }).mappings().one()
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'CROP_CREATED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"crop_id": str(row["id"]), "name": payload.name}),
        })
    return dict(row)


@router.patch("/crops/{crop_id}")
def update_crop(crop_id: UUID, payload: CropInput, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    with get_engine().begin() as connection:
        row = connection.execute(text("""
            UPDATE public.crops
            SET name = :name, category = :category, is_active = :is_active, updated_at = now()
            WHERE id = :crop_id
            RETURNING id, name, normalized_name, category, is_active
        """), {
            "crop_id": crop_id,
            "name": payload.name.strip(),
            "category": payload.category.strip(),
            "is_active": payload.is_active,
        }).mappings().one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Crop not found.")
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'CROP_UPDATED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"crop_id": str(crop_id), "name": payload.name}),
        })
    return dict(row)


@router.get("/crops/{crop_id}/varieties")
def list_varieties(crop_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT cv.id, cv.crop_id, cv.name, cv.normalized_name, cv.source, cv.is_active, cv.created_at
            FROM public.crop_varieties cv
            WHERE cv.crop_id = :crop_id
            ORDER BY cv.name ASC
        """), {"crop_id": crop_id}).mappings().all()
    return [dict(row) for row in rows]


@router.post("/crops/{crop_id}/varieties")
def create_variety(crop_id: UUID, payload: CropVarietyInput, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    with get_engine().begin() as connection:
        crop = connection.execute(text("SELECT id, name, normalized_name FROM public.crops WHERE id = :crop_id"), {"crop_id": crop_id}).mappings().one_or_none()
        if crop is None:
            raise HTTPException(status_code=404, detail="Crop not found.")

        variety_norm = _normalized_name(payload.name)
        # CRITICAL RULE: A variety must NOT be treated as another crop or repeat the crop name.
        if variety_norm == crop["normalized_name"]:
            raise HTTPException(status_code=400, detail="A variety name cannot be identical to the crop name.")

        row = connection.execute(text("""
            INSERT INTO public.crop_varieties (crop_id, name, normalized_name, source, is_active)
            VALUES (:crop_id, :name, :normalized_name, 'MANUAL_CATALOG', :is_active)
            ON CONFLICT (crop_id, normalized_name, source) DO UPDATE
            SET name = EXCLUDED.name, is_active = EXCLUDED.is_active, updated_at = now()
            RETURNING id, crop_id, name, is_active, created_at
        """), {
            "crop_id": crop_id,
            "name": payload.name.strip(),
            "normalized_name": variety_norm,
            "is_active": payload.is_active,
        }).mappings().one()

        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'VARIETY_CREATED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"crop_id": str(crop_id), "variety_id": str(row["id"]), "variety_name": payload.name}),
        })
    return dict(row)


@router.patch("/varieties/{variety_id}")
def update_variety(variety_id: UUID, payload: CropVarietyInput, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    with get_engine().begin() as connection:
        row = connection.execute(text("""
            UPDATE public.crop_varieties
            SET name = :name, is_active = :is_active, updated_at = now()
            WHERE id = :variety_id
            RETURNING id, crop_id, name, is_active
        """), {
            "variety_id": variety_id,
            "name": payload.name.strip(),
            "is_active": payload.is_active,
        }).mappings().one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Variety not found.")
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'VARIETY_UPDATED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"variety_id": str(variety_id), "name": payload.name}),
        })
    return dict(row)


# --- Orders & Payments ---

@router.get("/orders")
def list_orders(
    search: str = "",
    status: str | None = None,
    payment_status: str | None = None,
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[dict]:
    _require_admin(user)
    params = {"search": search.strip(), "status": status, "payment_status": payment_status}
    where_clauses = [
        "(:search = '' OR o.id::text ILIKE '%' || :search || '%' OR fp.name ILIKE '%' || :search || '%' OR bp.name ILIKE '%' || :search || '%')",
    ]
    if status:
        where_clauses.append("o.status = :status")
    if payment_status:
        where_clauses.append("o.payment_status = :payment_status")

    where_sql = " AND ".join(where_clauses)
    with get_engine().connect() as connection:
        rows = connection.execute(text(f"""
            SELECT o.id, o.status, o.payment_status, o.total_amount, o.created_at, o.updated_at,
                   fp.name AS farmer_name, bp.name AS buyer_name, bp.role AS buyer_role,
                   dp.name AS driver_name,
                   string_agg(cl.crop_name || ' (' || oi.quantity || ' ' || cl.unit || ')', ', ') AS items_summary
            FROM public.orders o
            JOIN public.farmers f ON f.id = o.farmer_id
            JOIN public.profiles fp ON fp.id = f.profile_id
            JOIN public.buyers b ON b.id = o.buyer_id
            JOIN public.profiles bp ON bp.id = b.profile_id
            LEFT JOIN public.delivery_jobs dj ON dj.order_id = o.id
            LEFT JOIN public.drivers d ON d.id = dj.driver_id
            LEFT JOIN public.profiles dp ON dp.id = d.profile_id
            LEFT JOIN public.order_items oi ON oi.order_id = o.id
            LEFT JOIN public.crop_listings cl ON cl.id = oi.crop_listing_id
            WHERE {where_sql}
            GROUP BY o.id, fp.name, bp.name, bp.role, dp.name
            ORDER BY o.created_at DESC
            LIMIT 200
        """), params).mappings().all()
    return [dict(row) for row in rows]


@router.get("/payments")
def list_payments(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT py.id, py.order_id, py.payer_profile_id, py.status, py.amount, py.currency,
                   py.payment_method, py.gateway_reference, py.provider_payment_id, py.paid_at,
                   py.created_at, py.updated_at,
                   payer.name AS payer_name, payer.email AS payer_email,
                   fp.name AS recipient_farmer_name,
                   tr.reference AS receipt_reference
            FROM public.payments py
            JOIN public.profiles payer ON payer.id = py.payer_profile_id
            JOIN public.orders o ON o.id = py.order_id
            JOIN public.farmers f ON f.id = o.farmer_id
            JOIN public.profiles fp ON fp.id = f.profile_id
            LEFT JOIN public.transaction_receipts tr ON tr.payment_id = py.id
            ORDER BY py.created_at DESC
            LIMIT 200
        """)).mappings().all()
    return [dict(row) for row in rows]


# --- Logistics / Deliveries ---

@router.get("/deliveries")
def list_deliveries(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT dj.id, dj.order_id, dj.status, dj.pickup_location, dj.delivery_location,
                   dj.estimated_distance_km, dj.created_at, dj.accepted_at, dj.picked_up_at, dj.delivered_at,
                   dj.driver_id, dp.name AS driver_name, dp.phone_number AS driver_phone,
                   fp.name AS farmer_name, bp.name AS buyer_name,
                   EXISTS (SELECT 1 FROM public.delivery_verifications dv WHERE dv.delivery_job_id = dj.id AND dv.kind = 'PICKUP' AND dv.verified_at IS NOT NULL) AS pickup_verified,
                   EXISTS (SELECT 1 FROM public.delivery_verifications dv WHERE dv.delivery_job_id = dj.id AND dv.kind = 'DELIVERY' AND dv.verified_at IS NOT NULL) AS delivery_verified
            FROM public.delivery_jobs dj
            JOIN public.orders o ON o.id = dj.order_id
            JOIN public.farmers f ON f.id = o.farmer_id
            JOIN public.profiles fp ON fp.id = f.profile_id
            JOIN public.buyers b ON b.id = o.buyer_id
            JOIN public.profiles bp ON bp.id = b.profile_id
            LEFT JOIN public.drivers d ON d.id = dj.driver_id
            LEFT JOIN public.profiles dp ON dp.id = d.profile_id
            ORDER BY dj.created_at DESC
            LIMIT 200
        """)).mappings().all()
    return [dict(row) for row in rows]


# --- Market Data Admin ---

@router.get("/market")
def market_data_overview(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    sync = _sync_status()
    with get_engine().connect() as connection:
        stats = connection.execute(text("""
            SELECT
              (SELECT count(*) FROM public.market_prices) AS total_cached_observations,
              (SELECT count(*) FROM public.crops) AS total_crops,
              (SELECT count(*) FROM public.crop_varieties) AS total_varieties
        """)).mappings().one()
        latest = connection.execute(text("""
            SELECT source_commodity AS commodity, source_variety AS variety, state, district, market,
                   modal_price, min_price, max_price, arrival_date, source, created_at
            FROM public.market_prices
            ORDER BY arrival_date DESC NULLS LAST, created_at DESC
            LIMIT 10
        """)).mappings().all()

    return {
        "sync_status": sync.get("upstream_status") or "NOT_SYNCED",
        "last_success_at": sync.get("last_success_at"),
        "last_attempt_at": sync.get("last_attempt_at"),
        "records_imported": sync.get("records_imported") or 0,
        "rate_limit_count": sync.get("rate_limit_count") or 0,
        "cooldown_until": sync.get("cooldown_until"),
        "last_error_category": sync.get("last_error_category"),
        "total_cached_observations": int(stats["total_cached_observations"] or 0),
        "total_crops": int(stats["total_crops"] or 0),
        "total_varieties": int(stats["total_varieties"] or 0),
        "latest_observations": [dict(obs) for obs in latest],
    }


@router.post("/market/sync")
async def trigger_market_sync(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    records = await _ensure_sync(background=False)
    with get_engine().begin() as connection:
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'MARKET_DATA_REFRESHED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"records_imported": records}),
        })
    return {"ok": True, "records_imported": records}


# --- Media Moderation ---

@router.get("/media")
async def list_media(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT clm.id, clm.listing_id, clm.media_type, clm.storage_key, clm.mime_type,
                   clm.file_size, clm.moderation_status, clm.created_at,
                   cl.crop_name, cl.variety, p.name AS farmer_name
            FROM public.crop_listing_media clm
            JOIN public.crop_listings cl ON cl.id = clm.listing_id
            JOIN public.farmers f ON f.id = cl.farmer_id
            JOIN public.profiles p ON p.id = f.profile_id
            ORDER BY clm.created_at DESC
            LIMIT 200
        """)).mappings().all()

    result = []
    for row in rows:
        d = dict(row)
        d["signed_url"] = await _signed_media_url(d.get("storage_key"))
        result.append(d)
    return result


@router.patch("/media/{media_id}")
def moderate_media(media_id: UUID, payload: MediaDecision, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    if payload.moderation_status not in {"ACTIVE", "FLAGGED", "HIDDEN"}:
        raise HTTPException(status_code=422, detail="Invalid media moderation status.")
    with get_engine().begin() as connection:
        row = connection.execute(text("""
            UPDATE public.crop_listing_media
            SET moderation_status = :status
            WHERE id = :media_id
            RETURNING id, listing_id, moderation_status
        """), {"media_id": media_id, "status": payload.moderation_status}).mappings().one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Media item not found.")
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'MEDIA_MODERATED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"media_id": str(media_id), "status": payload.moderation_status}),
        })
    return dict(row)


# --- Reports / Complaints Admin ---

@router.get("/reports")
def list_reports(status: str | None = None, user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    params = {"status": status}
    where_sql = "ur.status = :status" if status else "1=1"
    with get_engine().connect() as connection:
        rows = connection.execute(text(f"""
            SELECT ur.id, ur.reporter_id, ur.reported_profile_id, ur.listing_id, ur.order_id,
                   ur.reason, ur.description, ur.status, ur.resolution_note, ur.created_at, ur.updated_at,
                   rp.name AS reporter_name, rp.email AS reporter_email,
                   target.name AS reported_name, target.role AS reported_role,
                   cl.crop_name AS listing_name
            FROM public.user_reports ur
            LEFT JOIN public.profiles rp ON rp.id = ur.reporter_id
            LEFT JOIN public.profiles target ON target.id = ur.reported_profile_id
            LEFT JOIN public.crop_listings cl ON cl.id = ur.listing_id
            WHERE {where_sql}
            ORDER BY ur.created_at DESC
            LIMIT 200
        """), params).mappings().all()
    return [dict(row) for row in rows]


@router.patch("/reports/{report_id}")
def decide_report(report_id: UUID, payload: ReportDecision, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    if payload.status not in {"OPEN", "INVESTIGATING", "RESOLVED", "REJECTED"}:
        raise HTTPException(status_code=422, detail="Invalid report status.")
    with get_engine().begin() as connection:
        row = connection.execute(text("""
            UPDATE public.user_reports
            SET status = :status, resolution_note = :resolution_note, resolved_by = :resolved_by, updated_at = now()
            WHERE id = :report_id
            RETURNING id, status, resolution_note
        """), {"report_id": report_id, "status": payload.status, "resolution_note": payload.resolution_note, "resolved_by": user.id}).mappings().one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Report not found.")
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'REPORT_STATUS_CHANGED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"report_id": str(report_id), "status": payload.status, "note": payload.resolution_note}),
        })
    return dict(row)


# --- Editorial / Content Management ---

@router.get("/content")
def list_content(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT ci.id, ci.title, ci.short_description, ci.content, ci.category, ci.status,
                   ci.image_url, ci.publish_at, ci.expires_at, ci.created_at, ci.updated_at,
                   p.name AS author_name
            FROM public.content_items ci
            LEFT JOIN public.profiles p ON p.id = ci.author_id
            ORDER BY ci.updated_at DESC
        """)).mappings().all()
    return [dict(row) for row in rows]


@router.post("/content")
def create_content(payload: ContentInput, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    if payload.status not in {"DRAFT", "PUBLISHED", "SCHEDULED", "ARCHIVED"}:
        raise HTTPException(status_code=422, detail="Invalid content status.")
    with get_engine().begin() as connection:
        publish_at = payload.publish_at or (datetime.now(timezone.utc) if payload.status == "PUBLISHED" else None)
        row = connection.execute(text("""
            INSERT INTO public.content_items (title, short_description, content, category, status, image_url, publish_at, expires_at, author_id)
            VALUES (:title, :short_description, :content, :category, :status, :image_url, :publish_at, :expires_at, :author_id)
            RETURNING id, title, status, image_url, created_at
        """), {
            "title": payload.title.strip(),
            "short_description": payload.short_description.strip() if payload.short_description else None,
            "content": payload.content.strip(),
            "category": payload.category.strip(),
            "status": payload.status,
            "image_url": payload.image_url.strip() if payload.image_url else None,
            "publish_at": publish_at,
            "expires_at": payload.expires_at,
            "author_id": user.id,
        }).mappings().one()
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'CONTENT_CREATED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"content_id": str(row["id"]), "title": payload.title}),
        })
    return dict(row)


@router.put("/content/{content_id}")
def update_content(content_id: UUID, payload: ContentInput, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    if payload.status not in {"DRAFT", "PUBLISHED", "SCHEDULED", "ARCHIVED"}:
        raise HTTPException(status_code=422, detail="Invalid content status.")
    with get_engine().begin() as connection:
        publish_at = payload.publish_at or (datetime.now(timezone.utc) if payload.status == "PUBLISHED" else None)
        row = connection.execute(text("""
            UPDATE public.content_items
            SET title = :title, short_description = :short_description, content = :content,
                category = :category, status = :status, image_url = :image_url, publish_at = :publish_at,
                expires_at = :expires_at, updated_at = now()
            WHERE id = :content_id
            RETURNING id, title, status, image_url, updated_at
        """), {
            "content_id": content_id,
            "title": payload.title.strip(),
            "short_description": payload.short_description.strip() if payload.short_description else None,
            "content": payload.content.strip(),
            "category": payload.category.strip(),
            "status": payload.status,
            "image_url": payload.image_url.strip() if payload.image_url else None,
            "publish_at": publish_at,
            "expires_at": payload.expires_at,
        }).mappings().one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Content item not found.")
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'CONTENT_UPDATED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"content_id": str(content_id), "status": payload.status}),
        })
    return dict(row)


@router.delete("/content/{content_id}")
def delete_content(content_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    with get_engine().begin() as connection:
        deleted = connection.execute(text("DELETE FROM public.content_items WHERE id = :content_id RETURNING id"), {"content_id": content_id}).mappings().one_or_none()
        if deleted is None:
            raise HTTPException(status_code=404, detail="Content item not found.")
        connection.execute(text("""
            INSERT INTO public.security_audit_events (profile_id, event_type, metadata)
            VALUES (:profile_id, 'CONTENT_DELETED', CAST(:metadata AS jsonb))
        """), {
            "profile_id": user.id,
            "metadata": json.dumps({"content_id": str(content_id)}),
        })
    return {"ok": True}


# --- Platform Overview (Read-Only Live Operational Data) ---

@router.get("/platform-overview")
def platform_overview(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    sync = _sync_status()
    with get_engine().connect() as connection:
        counts = connection.execute(text("""
            SELECT
              -- Users
              (SELECT count(*) FROM public.profiles WHERE role = 'FARMER') AS farmers_total,
              (SELECT count(*) FROM public.profiles WHERE role = 'BUYER') AS buyers_total,
              (SELECT count(*) FROM public.profiles WHERE role = 'CONSUMER') AS consumers_total,
              (SELECT count(*) FROM public.profiles WHERE role = 'DRIVER') AS drivers_total,

              -- Marketplace
              (SELECT count(*) FROM public.crop_listings WHERE status = 'ACTIVE') AS active_listings,
              (SELECT count(*) FROM public.crop_listings WHERE status = 'SOLD_OUT') AS sold_listings,
              (SELECT count(*) FROM public.crops) AS crop_count,
              (SELECT count(*) FROM public.crop_varieties) AS variety_count,

              -- Orders
              (SELECT count(*) FROM public.orders WHERE status IN ('PENDING', 'PLACED', 'CONFIRMED')) AS pending_orders,
              (SELECT count(*) FROM public.orders WHERE payment_status = 'PAID') AS paid_orders,
              (SELECT count(*) FROM public.orders WHERE status = 'DELIVERED') AS delivered_orders,
              (SELECT count(*) FROM public.orders WHERE status IN ('CANCELLED', 'REJECTED')) AS cancelled_orders,

              -- Payments
              (SELECT count(*) FROM public.payments WHERE status IN ('CAPTURED', 'SUCCESS', 'PAID')) AS successful_payments,
              (SELECT count(*) FROM public.payments WHERE status IN ('CREATED', 'PENDING', 'AUTHORIZED')) AS pending_payments,
              (SELECT count(*) FROM public.payments WHERE status = 'FAILED') AS failed_payments,
              (SELECT count(*) FROM public.payments WHERE status = 'REFUNDED') AS refunded_payments,

              -- Drivers
              (SELECT count(*) FROM public.drivers WHERE approval_status = 'PENDING') AS pending_driver_approvals,
              (SELECT count(*) FROM public.drivers WHERE approval_status = 'APPROVED') AS approved_drivers,
              (SELECT count(*) FROM public.delivery_jobs WHERE status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')) AS active_drivers,
              (SELECT count(*) FROM public.delivery_jobs WHERE status = 'DELIVERED') AS completed_deliveries,

              -- Market Data
              (SELECT count(*) FROM public.market_prices) AS cached_market_records,

              -- Notifications
              (SELECT count(*) FROM public.notification_records WHERE channel = 'EMAIL' AND status IN ('SENT', 'DELIVERED')) AS email_sent,
              (SELECT count(*) FROM public.notification_records WHERE channel = 'SMS' AND status IN ('SENT', 'DELIVERED')) AS sms_sent,
              (SELECT count(*) FROM public.notification_records WHERE status = 'FAILED') AS notification_failures,

              -- Reports
              (SELECT count(*) FROM public.user_reports WHERE status = 'OPEN') AS open_reports,
              (SELECT count(*) FROM public.user_reports WHERE status = 'INVESTIGATING') AS investigating_reports,
              (SELECT count(*) FROM public.user_reports WHERE status = 'RESOLVED') AS resolved_reports
        """)).mappings().one()

    return {
        "users": {
            "farmers": int(counts["farmers_total"] or 0),
            "buyers": int(counts["buyers_total"] or 0),
            "consumers": int(counts["consumers_total"] or 0),
            "drivers": int(counts["drivers_total"] or 0),
        },
        "marketplace": {
            "active_listings": int(counts["active_listings"] or 0),
            "sold_listings": int(counts["sold_listings"] or 0),
            "crop_count": int(counts["crop_count"] or 0),
            "variety_count": int(counts["variety_count"] or 0),
        },
        "orders": {
            "pending": int(counts["pending_orders"] or 0),
            "paid": int(counts["paid_orders"] or 0),
            "delivered": int(counts["delivered_orders"] or 0),
            "cancelled": int(counts["cancelled_orders"] or 0),
        },
        "payments": {
            "successful": int(counts["successful_payments"] or 0),
            "pending": int(counts["pending_payments"] or 0),
            "failed": int(counts["failed_payments"] or 0),
            "refunded": int(counts["refunded_payments"] or 0),
        },
        "drivers": {
            "pending_approval": int(counts["pending_driver_approvals"] or 0),
            "approved": int(counts["approved_drivers"] or 0),
            "active": int(counts["active_drivers"] or 0),
            "deliveries": int(counts["completed_deliveries"] or 0),
        },
        "market_data": {
            "cached_market_records": int(counts["cached_market_records"] or 0),
            "crop_count": int(counts["crop_count"] or 0),
            "variety_count": int(counts["variety_count"] or 0),
            "last_successful_sync": sync.get("last_success_at"),
            "last_failure": sync.get("last_error_category") or "None",
            "cache_status": sync.get("upstream_status") or "ACTIVE_CACHE",
        },
        "notifications": {
            "email_status": f"{int(counts['email_sent'] or 0)} sent",
            "sms_status": f"{int(counts['sms_sent'] or 0)} sent",
            "notification_failures": int(counts["notification_failures"] or 0),
        },
        "reports": {
            "open": int(counts["open_reports"] or 0),
            "investigating": int(counts["investigating_reports"] or 0),
            "resolved": int(counts["resolved_reports"] or 0),
        }
    }


# --- Notifications Admin ---

@router.get("/notifications")
def list_notifications(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_admin(user)
    with get_engine().connect() as connection:
        rows = connection.execute(text("""
            SELECT nr.id, nr.profile_id, nr.kind, nr.channel, nr.status, nr.last_error,
                   nr.created_at, nr.sent_at,
                   p.name AS recipient_name, p.email AS recipient_email, p.phone_number AS recipient_phone
            FROM public.notification_records nr
            JOIN public.profiles p ON p.id = nr.profile_id
            ORDER BY nr.created_at DESC
            LIMIT 200
        """)).mappings().all()
    return [dict(row) for row in rows]


# --- Audit Logs ---

@router.get("/audit-logs")
@router.get("/security-events")
def list_audit_logs(
    event_type: str | None = None,
    page: int = 1,
    page_size: int = 50,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    _require_admin(user)
    page_size = min(max(page_size, 1), 100)
    offset = max(page - 1, 0) * page_size
    params = {"event_type": event_type, "limit": page_size, "offset": offset}
    where_sql = "sa.event_type = :event_type" if event_type else "1=1"
    with get_engine().connect() as connection:
        total = connection.execute(text(f"SELECT count(*) FROM public.security_audit_events sa WHERE {where_sql}"), params).scalar() or 0
        rows = connection.execute(text(f"""
            SELECT sa.id, sa.profile_id, sa.event_type, sa.identifier, sa.metadata, sa.created_at,
                   p.name AS actor_name, p.email AS actor_email, p.role AS actor_role
            FROM public.security_audit_events sa
            LEFT JOIN public.profiles p ON p.id = sa.profile_id
            WHERE {where_sql}
            ORDER BY sa.created_at DESC
            LIMIT :limit OFFSET :offset
        """), params).mappings().all()
    return {"items": [dict(row) for row in rows], "total": int(total), "page": page, "page_size": page_size}


@router.get("/settings")
def platform_settings(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_admin(user)
    with get_engine().connect() as connection:
        admin_count = connection.execute(text("SELECT count(*) FROM public.profiles WHERE role = 'ADMIN' AND account_status = 'ACTIVE'")).scalar() or 0
        user_count = connection.execute(text("SELECT count(*) FROM public.profiles WHERE account_status = 'ACTIVE'")).scalar() or 0
    return {
        "admin_count": int(admin_count),
        "total_active_users": int(user_count),
        "storage_configured": bool(settings.supabase_url and settings.supabase_service_role_key),
        "market_sync_configured": bool(settings.market_data_gov_api_key),
        "server_time": datetime.now(timezone.utc).isoformat(),
    }

