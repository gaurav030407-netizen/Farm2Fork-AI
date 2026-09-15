from __future__ import annotations

from pathlib import PurePosixPath
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import text

from ..auth import AuthenticatedUser, get_current_user
from ..config import settings
from ..database.connection import get_engine
from ..schemas.profile import ProfileResponse, ProfileUpdateRequest, VerificationResponse

router = APIRouter(prefix="/api/profile", tags=["profiles"])
MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg": ("jpg", (b"\xff\xd8\xff",)), "image/png": ("png", (b"\x89PNG\r\n\x1a\n",)), "image/webp": ("webp", (b"RIFF",))}


@router.get("/reverse-geocode")
async def reverse_geocode(latitude: float, longitude: float, _user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise HTTPException(status_code=422, detail="Invalid location selected. Please choose another location.")
    try:
        async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "Farm2Fork/1.0 profile-location"}) as client:
            response = await client.get("https://nominatim.openstreetmap.org/reverse", params={"lat": latitude, "lon": longitude, "format": "jsonv2", "addressdetails": 1, "zoom": 18})
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="Address service is temporarily busy. Please try again in a moment.")
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Location detected, but the address could not be retrieved. Please check the address manually.")
        try:
            payload = response.json()
        except ValueError:
            raise HTTPException(status_code=502, detail="Address service returned an invalid response. Please edit the address manually.") from None
        if not isinstance(payload, dict):
            raise HTTPException(status_code=502, detail="Address service returned no usable address. Please edit the address manually.")
        address = payload.get("address") if isinstance(payload.get("address"), dict) else {}
        locality = address.get("village") or address.get("hamlet") or address.get("suburb") or address.get("neighbourhood") or address.get("town") or address.get("city") or address.get("municipality") or address.get("district") or address.get("county") or ""
        city = address.get("city") or address.get("town") or address.get("municipality") or address.get("village") or address.get("district") or address.get("county") or ""
        landmark = address.get("road") or address.get("neighbourhood") or address.get("suburb") or ""
        components = [address.get("house_number"), address.get("road"), address.get("neighbourhood") or address.get("suburb"), locality, address.get("district"), address.get("state"), address.get("postcode"), address.get("country")]
        readable = ", ".join(dict.fromkeys(str(item).strip() for item in components if item))
        return {"success": bool(payload.get("display_name") or readable), "latitude": latitude, "longitude": longitude, "display_name": payload.get("display_name") or readable, "address": readable, "locality": locality, "landmark": landmark, "city": city, "state": address.get("state") or "", "pin_code": address.get("postcode") or "", "country": address.get("country") or ""}
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Location detected, but the address could not be retrieved. Please check the address manually.") from None


def _completion(row: dict) -> int:
    common = [row.get("name"), row.get("profile_photo_path"), row.get("bio"), row.get("address"), row.get("city") or row.get("location"), row.get("state"), row.get("pin_code")]
    role_fields = [row.get("farm_name"), row.get("farm_size"), row.get("crops_grown"), row.get("farming_experience"), row.get("farming_type"), row.get("farm_description")] if row.get("role") == "FARMER" else [row.get("business_name"), row.get("buyer_type"), row.get("preferred_crops") or row.get("purchasing_interests")]
    fields = common + role_fields
    return round(sum(bool(value) for value in fields) / len(fields) * 100)


async def _photo_url(path: str | None) -> str | None:
    if not path or not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    safe_path = str(PurePosixPath(path))
    if safe_path != path or safe_path.startswith("/") or ".." in PurePosixPath(path).parts:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(f"{settings.supabase_url}/storage/v1/object/sign/profile-images/{safe_path}", headers={"apikey": settings.supabase_service_role_key, "Authorization": f"Bearer {settings.supabase_service_role_key}", "Content-Type": "application/json"}, json={"expiresIn": 3600})
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


async def _delete_photo(path: str | None) -> None:
    if not path or not settings.supabase_url or not settings.supabase_service_role_key:
        return
    safe_path = str(PurePosixPath(path))
    if safe_path != path or safe_path.startswith("/") or ".." in PurePosixPath(path).parts:
        return
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.delete(f"{settings.supabase_url}/storage/v1/object/profile-images/{safe_path}", headers={"apikey": settings.supabase_service_role_key, "Authorization": f"Bearer {settings.supabase_service_role_key}"})
    except httpx.RequestError:
        return


def _profile_query(where: str, params: dict) -> dict | None:
    with get_engine().connect() as connection:
        row = connection.execute(text(f"""
                 SELECT p.id, p.name, p.email, p.role, p.email_verified, p.email_verified_at,
                     p.profile_photo_path, p.mobile, p.phone_number, p.phone_verified,
                     p.phone_verified_at, p.preferred_otp_method, p.location, p.city, p.state, p.bio, p.address, p.locality,
                   p.landmark, p.pin_code, p.latitude, p.longitude, p.created_at,
                   f.id AS farmer_id, f.farm_name, f.location AS farm_location,
                   f.crops_grown, f.farming_experience, f.farm_description,
                   f.farm_size, f.farm_size_unit, f.farming_type,
                   b.id AS buyer_id, b.business_name, b.location AS business_location,
                   b.buyer_type, b.purchasing_interests, b.preferred_crops, b.delivery_address,
                   d.id AS driver_id, d.service_area, d.vehicle_type, d.vehicle_registration,
                   d.availability_status, d.approval_status, d.current_latitude, d.current_longitude,
                   iv.status AS pan_status, iv.masked_identifier, iv.provider,
                   iv.name_match, iv.verified_at
            FROM public.profiles p
            LEFT JOIN public.farmers f ON f.profile_id = p.id
            LEFT JOIN public.buyers b ON b.profile_id = p.id
            LEFT JOIN public.drivers d ON d.profile_id = p.id
            LEFT JOIN public.identity_verifications iv ON iv.user_id = p.id AND iv.verification_type = 'PAN'
            WHERE {where}
        """), params).mappings().one_or_none()
    return dict(row) if row else None


async def _response(row: dict, public: bool = False) -> ProfileResponse:
    safe = dict(row)
    if public:
        safe["email"] = None
        safe["mobile"] = None
        safe["location"] = None
        safe["farm_location"] = None
        safe["business_location"] = None
        safe["address"] = None
        safe["locality"] = None
        safe["landmark"] = None
        safe["pin_code"] = None
        safe["latitude"] = None
        safe["longitude"] = None
        safe["masked_identifier"] = None
        safe["provider"] = None
        safe["name_match"] = None
    verification = VerificationResponse(status=safe.get("pan_status") or "NOT_SUBMITTED", masked_identifier=safe.get("masked_identifier"), provider=safe.get("provider"), name_match=safe.get("name_match"), verified_at=safe.get("verified_at"))
    return ProfileResponse(**{**safe, "profile_photo_url": await _photo_url(safe.get("profile_photo_path")), "completion_percent": _completion(safe), "pan_verification": verification, "email_verified": bool(safe.get("email_verified")), "phone_verified": bool(safe.get("phone_verified"))})


@router.get("/me", response_model=ProfileResponse)
async def get_my_profile(user: AuthenticatedUser = Depends(get_current_user)) -> ProfileResponse:
    row = _profile_query("p.id = :profile_id", {"profile_id": user.id})
    if row is None:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return await _response(row)


@router.get("/{user_id}", response_model=ProfileResponse)
async def get_public_profile(user_id: UUID, _user: AuthenticatedUser = Depends(get_current_user)) -> ProfileResponse:
    row = _profile_query("p.id = :profile_id AND p.role IN ('FARMER', 'BUYER', 'CONSUMER')", {"profile_id": user_id})
    if row is None:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return await _response(row, public=True)


@router.patch("/me", response_model=ProfileResponse)
async def update_my_profile(payload: ProfileUpdateRequest, user: AuthenticatedUser = Depends(get_current_user)) -> ProfileResponse:
    changes = payload.model_dump(exclude_unset=True)
    with get_engine().begin() as connection:
        profile_fields = {key: changes.pop(key) for key in list(changes) if key in {"name", "mobile", "city", "state", "bio", "address", "locality", "landmark", "pin_code", "latitude", "longitude"}}
        if profile_fields.get("pin_code") and not profile_fields["pin_code"].isdigit():
            raise HTTPException(status_code=422, detail="PIN code must contain digits only.")
        if profile_fields.get("pin_code") and not 4 <= len(profile_fields["pin_code"]) <= 10:
            raise HTTPException(status_code=422, detail="Enter a valid PIN code.")
        if profile_fields:
            assignments = ", ".join(f"{key} = :{key}" for key in profile_fields)
            connection.execute(text(f"UPDATE public.profiles SET {assignments}, updated_at = now() WHERE id = :profile_id"), {**profile_fields, "profile_id": user.id})
        table = "farmers" if user.role == "FARMER" else "drivers" if user.role == "DRIVER" else "buyers"
        allowed = {"farm_name", "farm_location", "crops_grown", "farming_experience", "farm_description", "farm_size", "farm_size_unit", "farming_type"} if user.role == "FARMER" else {"service_area", "vehicle_type", "vehicle_registration"} if user.role == "DRIVER" else {"business_name", "buyer_type", "purchasing_interests", "preferred_crops", "business_location", "delivery_address"}
        role_changes = {key: value for key, value in changes.items() if key in allowed}
        if "farm_location" in role_changes:
            role_changes["location"] = role_changes.pop("farm_location")
        if "business_location" in role_changes:
            role_changes["location"] = role_changes.pop("business_location")
        if role_changes:
            assignments = ", ".join(f"{key} = :{key}" for key in role_changes)
            connection.execute(text(f"UPDATE public.{table} SET {assignments} WHERE profile_id = :profile_id"), {**role_changes, "profile_id": user.id})
    row = _profile_query("p.id = :profile_id", {"profile_id": user.id})
    return await _response(row)


@router.post("/me/photo", response_model=ProfileResponse)
async def upload_profile_photo(file: Annotated[UploadFile, File(...)], user: AuthenticatedUser = Depends(get_current_user)) -> ProfileResponse:
    details = IMAGE_TYPES.get(file.content_type or "")
    if details is None:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, or WebP profile photo.")
    extension, signatures = details
    image_bytes = await file.read(MAX_PROFILE_IMAGE_BYTES + 1)
    if len(image_bytes) > MAX_PROFILE_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Profile photos must be 5 MB or smaller.")
    if not any(image_bytes.startswith(signature) for signature in signatures) or (extension == "webp" and image_bytes[8:12] != b"WEBP"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid profile image.")
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="Image storage is not configured on the server.")
    path = f"{user.id}/profile.{extension}"
    with get_engine().connect() as connection:
        previous_path = connection.execute(text("SELECT profile_photo_path FROM public.profiles WHERE id = :profile_id"), {"profile_id": user.id}).scalar_one_or_none()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(f"{settings.supabase_url}/storage/v1/object/profile-images/{path}", headers={"apikey": settings.supabase_service_role_key, "Authorization": f"Bearer {settings.supabase_service_role_key}", "Content-Type": file.content_type or "", "x-upsert": "true"}, content=image_bytes)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Image storage is temporarily unavailable.") from None
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="The profile photo could not be uploaded.")
    with get_engine().begin() as connection:
        connection.execute(text("UPDATE public.profiles SET profile_photo_path = :path, updated_at = now() WHERE id = :profile_id"), {"path": path, "profile_id": user.id})
    if previous_path and previous_path != path:
        await _delete_photo(previous_path)
    row = _profile_query("p.id = :profile_id", {"profile_id": user.id})
    return await _response(row)

