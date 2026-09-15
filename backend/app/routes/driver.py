from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text

from ..auth import AuthenticatedUser, get_current_user
from ..database.connection import get_engine
from ..schemas.driver import DeliveryJobResponse, DriverProfileResponse, DriverProfileUpdate, VerificationRequest

router = APIRouter(prefix="/api/drivers", tags=["drivers"])


def _require_driver(user: AuthenticatedUser) -> None:
    if user.role != "DRIVER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only driver accounts can access this endpoint.")


def _driver_id(connection, user: AuthenticatedUser) -> UUID:
    row = connection.execute(text("SELECT id FROM public.drivers WHERE profile_id = :profile_id AND approval_status = 'APPROVED'"), {"profile_id": user.id}).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=403, detail="Driver approval is required before using delivery tools.")
    return row


def _job(row: dict) -> DeliveryJobResponse:
    return DeliveryJobResponse(
        id=row["id"], order_id=row["order_id"], status=row["status"],
        pickup_location=row["pickup_location"], delivery_location=row["delivery_location"],
        estimated_distance_km=float(row["estimated_distance_km"]) if row["estimated_distance_km"] is not None else None,
        farmer_name=row.get("farmer_name"), buyer_name=row.get("buyer_name"),
        quantity_summary=row.get("quantity_summary"), created_at=row["created_at"],
        accepted_at=row.get("accepted_at"), picked_up_at=row.get("picked_up_at"), delivered_at=row.get("delivered_at"),
    )


def _job_query(connection, where: str, params: dict) -> list[dict]:
    rows = connection.execute(text(f"""
        SELECT dj.id, dj.order_id, dj.status, dj.pickup_location, dj.delivery_location,
               dj.estimated_distance_km, dj.created_at, dj.accepted_at, dj.picked_up_at, dj.delivered_at,
               fp.name AS farmer_name, bp.name AS buyer_name,
               string_agg(cl.crop_name || ' x ' || oi.quantity || ' ' || cl.unit, ', ') AS quantity_summary
        FROM public.delivery_jobs dj
        JOIN public.orders o ON o.id = dj.order_id
        JOIN public.farmers f ON f.id = o.farmer_id
        JOIN public.profiles fp ON fp.id = f.profile_id
        JOIN public.buyers b ON b.id = o.buyer_id
        JOIN public.profiles bp ON bp.id = b.profile_id
        JOIN public.order_items oi ON oi.order_id = o.id
        JOIN public.crop_listings cl ON cl.id = oi.crop_listing_id
        WHERE {where}
        GROUP BY dj.id, fp.name, bp.name
        ORDER BY dj.created_at DESC
    """), params).mappings().all()
    return [dict(row) for row in rows]


def _hash_otp(otp: str, salt: str) -> str:
    return f"{salt}:{hashlib.sha256(f'{salt}:{otp}'.encode()).hexdigest()}"


def _new_otp() -> tuple[str, str]:
    otp = f"{secrets.randbelow(900000) + 100000:06d}"
    salt = secrets.token_hex(16)
    return otp, _hash_otp(otp, salt)


def _verify_otp(otp: str, stored: str) -> bool:
    salt, _, digest = stored.partition(":")
    return bool(salt and digest and secrets.compare_digest(_hash_otp(otp, salt), stored))


@router.get("/me", response_model=DriverProfileResponse)
def get_driver_profile(user: AuthenticatedUser = Depends(get_current_user)) -> DriverProfileResponse:
    _require_driver(user)
    with get_engine().connect() as connection:
        row = connection.execute(text("SELECT id, service_area, vehicle_type, vehicle_registration, availability_status, approval_status, current_latitude, current_longitude, location_updated_at FROM public.drivers WHERE profile_id = :profile_id"), {"profile_id": user.id}).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Driver profile not found.")
    return DriverProfileResponse(**dict(row))


@router.patch("/me", response_model=DriverProfileResponse)
def update_driver_profile(payload: DriverProfileUpdate, user: AuthenticatedUser = Depends(get_current_user)) -> DriverProfileResponse:
    _require_driver(user)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("availability_status") not in {None, "ONLINE", "OFFLINE"}:
        raise HTTPException(status_code=422, detail="Availability must be ONLINE or OFFLINE.")
    if not changes:
        return get_driver_profile(user)
    assignments = ", ".join(f"{key} = :{key}" for key in changes)
    with get_engine().begin() as connection:
        driver_id = _driver_id(connection, user)
        connection.execute(text(f"UPDATE public.drivers SET {assignments}, location_updated_at = CASE WHEN :current_latitude IS NOT NULL OR :current_longitude IS NOT NULL THEN now() ELSE location_updated_at END WHERE id = :driver_id"), {**changes, "current_latitude": changes.get("current_latitude"), "current_longitude": changes.get("current_longitude"), "driver_id": driver_id})
    return get_driver_profile(user)


@router.get("/jobs", response_model=list[DeliveryJobResponse])
def list_jobs(user: AuthenticatedUser = Depends(get_current_user)) -> list[DeliveryJobResponse]:
    _require_driver(user)
    with get_engine().connect() as connection:
        driver_id = _driver_id(connection, user)
        location = connection.execute(text("SELECT current_latitude, current_longitude FROM public.drivers WHERE id = :driver_id"), {"driver_id": driver_id}).mappings().one()
        where = "dj.status = 'AVAILABLE'"
        params: dict = {}
        if location["current_latitude"] is not None and location["current_longitude"] is not None:
            where += " AND dj.pickup_latitude IS NOT NULL AND dj.pickup_longitude IS NOT NULL AND sqrt(power((dj.pickup_latitude - :latitude) * 111, 2) + power((dj.pickup_longitude - :longitude) * 111 * cos(radians(:latitude)), 2)) <= 50"
            params.update({"latitude": location["current_latitude"], "longitude": location["current_longitude"]})
        return [_job(row) for row in _job_query(connection, where, params)]


@router.get("/earnings")
def earnings(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    _require_driver(user)
    with get_engine().connect() as connection:
        driver_id = _driver_id(connection, user)
        rows = connection.execute(text("SELECT e.id, e.delivery_job_id, e.amount, e.status, e.paid_at, e.created_at, dj.order_id, dj.delivered_at FROM public.driver_earnings e JOIN public.delivery_jobs dj ON dj.id = e.delivery_job_id WHERE e.driver_id = :driver_id ORDER BY e.created_at DESC"), {"driver_id": driver_id}).mappings().all()
    return [dict(row) for row in rows]


@router.get("/jobs/active", response_model=list[DeliveryJobResponse])
def active_jobs(user: AuthenticatedUser = Depends(get_current_user)) -> list[DeliveryJobResponse]:
    _require_driver(user)
    with get_engine().connect() as connection:
        driver_id = _driver_id(connection, user)
        return [_job(row) for row in _job_query(connection, "dj.driver_id = :driver_id AND dj.status IN ('ACCEPTED', 'PICKED_UP')", {"driver_id": driver_id})]


@router.post("/jobs/{job_id}/accept", response_model=DeliveryJobResponse)
def accept_job(job_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> DeliveryJobResponse:
    _require_driver(user)
    with get_engine().begin() as connection:
        driver_id = _driver_id(connection, user)
        updated = connection.execute(text("UPDATE public.delivery_jobs SET driver_id = :driver_id, status = 'ACCEPTED', accepted_at = now(), updated_at = now() WHERE id = :job_id AND status = 'AVAILABLE' RETURNING id"), {"driver_id": driver_id, "job_id": job_id}).scalar_one_or_none()
        if updated is None:
            raise HTTPException(status_code=409, detail="This delivery job is no longer available.")
        return _job(_job_query(connection, "dj.id = :job_id", {"job_id": job_id})[0])


@router.post("/jobs/{job_id}/pickup/request", status_code=202)
def request_pickup_verification(job_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_driver(user)
    with get_engine().begin() as connection:
        driver_id = _driver_id(connection, user)
        job = connection.execute(text("SELECT id FROM public.delivery_jobs WHERE id = :job_id AND driver_id = :driver_id AND status = 'ACCEPTED' FOR UPDATE"), {"job_id": job_id, "driver_id": driver_id}).scalar_one_or_none()
        if job is None:
            raise HTTPException(status_code=409, detail="The delivery is not ready for pickup verification.")
        otp, otp_hash = _new_otp()
        connection.execute(text("DELETE FROM public.delivery_verifications WHERE delivery_job_id = :job_id AND kind = 'PICKUP' AND verified_at IS NULL"), {"job_id": job_id})
        connection.execute(text("INSERT INTO public.delivery_verifications (delivery_job_id, kind, otp_hash, expires_at) VALUES (:job_id, 'PICKUP', :otp_hash, now() + interval '10 minutes')"), {"job_id": job_id, "otp_hash": otp_hash})
    return {"ok": True, "delivery_job_id": job_id, "notification": "Pickup verification has been requested from the farmer."}


@router.post("/jobs/{job_id}/pickup/verify", response_model=DeliveryJobResponse)
def verify_pickup(job_id: UUID, payload: VerificationRequest, user: AuthenticatedUser = Depends(get_current_user)) -> DeliveryJobResponse:
    _require_driver(user)
    with get_engine().begin() as connection:
        driver_id = _driver_id(connection, user)
        verification = connection.execute(text("SELECT dv.id, dv.otp_hash, dv.expires_at, dv.attempts FROM public.delivery_verifications dv JOIN public.delivery_jobs dj ON dj.id = dv.delivery_job_id WHERE dv.delivery_job_id = :job_id AND dv.kind = 'PICKUP' AND dv.verified_at IS NULL AND dj.driver_id = :driver_id FOR UPDATE"), {"job_id": job_id, "driver_id": driver_id}).mappings().one_or_none()
        if verification is None or verification["expires_at"].replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc) or verification["attempts"] >= 5:
            raise HTTPException(status_code=400, detail="Pickup verification is unavailable or expired.")
        if not _verify_otp(payload.otp, verification["otp_hash"]):
            connection.execute(text("UPDATE public.delivery_verifications SET attempts = attempts + 1 WHERE id = :id"), {"id": verification["id"]})
            raise HTTPException(status_code=400, detail="Invalid pickup verification code.")
        connection.execute(text("UPDATE public.delivery_verifications SET verified_at = now() WHERE id = :id"), {"id": verification["id"]})
        connection.execute(text("UPDATE public.delivery_jobs SET status = 'PICKED_UP', picked_up_at = now(), updated_at = now() WHERE id = :job_id"), {"job_id": job_id})
        connection.execute(text("UPDATE public.orders SET status = 'OUT_FOR_DELIVERY', updated_at = now() WHERE id = (SELECT order_id FROM public.delivery_jobs WHERE id = :job_id)"), {"job_id": job_id})
        return _job(_job_query(connection, "dj.id = :job_id", {"job_id": job_id})[0])


@router.post("/jobs/{job_id}/delivery/request", status_code=202)
def request_delivery_verification(job_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    _require_driver(user)
    with get_engine().begin() as connection:
        driver_id = _driver_id(connection, user)
        exists = connection.execute(text("SELECT 1 FROM public.delivery_jobs WHERE id = :job_id AND driver_id = :driver_id AND status = 'PICKED_UP'"), {"job_id": job_id, "driver_id": driver_id}).scalar_one_or_none()
        if exists is None:
            raise HTTPException(status_code=409, detail="The delivery is not ready for drop-off verification.")
        otp, otp_hash = _new_otp()
        connection.execute(text("DELETE FROM public.delivery_verifications WHERE delivery_job_id = :job_id AND kind = 'DELIVERY' AND verified_at IS NULL"), {"job_id": job_id})
        connection.execute(text("INSERT INTO public.delivery_verifications (delivery_job_id, kind, otp_hash, expires_at) VALUES (:job_id, 'DELIVERY', :otp_hash, now() + interval '10 minutes')"), {"job_id": job_id, "otp_hash": otp_hash})
    return {"ok": True, "delivery_job_id": job_id, "notification": "Delivery confirmation has been requested from the recipient."}


@router.post("/jobs/{job_id}/delivery/verify", response_model=DeliveryJobResponse)
def verify_delivery(job_id: UUID, payload: VerificationRequest, user: AuthenticatedUser = Depends(get_current_user)) -> DeliveryJobResponse:
    with get_engine().begin() as connection:
        recipient = connection.execute(text("SELECT b.profile_id FROM public.delivery_jobs dj JOIN public.orders o ON o.id = dj.order_id JOIN public.buyers b ON b.id = o.buyer_id WHERE dj.id = :job_id"), {"job_id": job_id}).scalar_one_or_none()
        if recipient != user.id:
            raise HTTPException(status_code=403, detail="Only the order recipient can confirm delivery.")
        verification = connection.execute(text("SELECT dv.id, dv.otp_hash, dv.expires_at, dv.attempts FROM public.delivery_verifications dv JOIN public.delivery_jobs dj ON dj.id = dv.delivery_job_id WHERE dv.delivery_job_id = :job_id AND dv.kind = 'DELIVERY' AND dv.verified_at IS NULL FOR UPDATE"), {"job_id": job_id}).mappings().one_or_none()
        if verification is None or verification["expires_at"].replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc) or verification["attempts"] >= 5:
            raise HTTPException(status_code=400, detail="Delivery verification is unavailable or expired.")
        if not _verify_otp(payload.otp, verification["otp_hash"]):
            connection.execute(text("UPDATE public.delivery_verifications SET attempts = attempts + 1 WHERE id = :id"), {"id": verification["id"]})
            raise HTTPException(status_code=400, detail="Invalid delivery verification code.")
        connection.execute(text("UPDATE public.delivery_verifications SET verified_at = now() WHERE id = :id"), {"id": verification["id"]})
        connection.execute(text("UPDATE public.delivery_jobs SET status = 'DELIVERED', delivered_at = now(), updated_at = now() WHERE id = :job_id"), {"job_id": job_id})
        connection.execute(text("UPDATE public.orders SET status = 'DELIVERED', updated_at = now() WHERE id = (SELECT order_id FROM public.delivery_jobs WHERE id = :job_id)"), {"job_id": job_id})
        connection.execute(text("INSERT INTO public.driver_earnings (delivery_job_id, driver_id, amount) SELECT dj.id, dj.driver_id, 0 FROM public.delivery_jobs dj WHERE dj.id = :job_id ON CONFLICT (delivery_job_id) DO NOTHING"), {"job_id": job_id})
        return _job(_job_query(connection, "dj.id = :job_id", {"job_id": job_id})[0])
