"""Authenticated farmer crop listing endpoints."""

from __future__ import annotations

from datetime import date
from pathlib import PurePosixPath
from typing import Annotated
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from ..auth import AuthenticatedUser, get_current_user
from ..config import settings
from ..database.connection import get_engine
from ..schemas.listings import (
    ListingCreateRequest,
    ListingMediaResponse,
    ListingResponse,
    ListingStatus,
    ListingUpdateRequest,
)
from ..services.profile_media import signed_profile_photo_url


router = APIRouter(prefix="/api/farmer/listings", tags=["farmer-listings"])
public_router = APIRouter(prefix="/api/marketplace/listings", tags=["marketplace"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_VIDEO_BYTES = 50 * 1024 * 1024
IMAGE_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "jpg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "webp": (b"RIFF",),
}
IMAGE_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
VIDEO_CONTENT_TYPES = {"video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov"}


def _farmer_id(user: AuthenticatedUser) -> UUID:
    with get_engine().connect() as connection:
        farmer_id = connection.execute(
            text(
                """
                SELECT f.id
                FROM public.profiles AS p
                JOIN public.farmers AS f ON f.profile_id = p.id
                WHERE p.id = :profile_id
                  AND p.role = 'FARMER'
                """
            ),
            {"profile_id": user.id},
        ).scalar_one_or_none()

    if farmer_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only farmer accounts can manage crop listings.",
        )
    return farmer_id


def _listing_row(listing_id: UUID, farmer_id: UUID) -> dict | None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT id, crop_name, variety, quantity, unit, price, quality,
                       location, harvest_date, image_url, status, created_at,
                       updated_at
                FROM public.crop_listings
                WHERE id = :listing_id
                  AND farmer_id = :farmer_id
                """
            ),
            {"listing_id": listing_id, "farmer_id": farmer_id},
        ).mappings().one_or_none()
    return dict(row) if row is not None else None


def _friendly_database_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="The crop listing could not be saved right now.",
    )


def _response_data(row: dict, signed_image_url: str | None = None) -> ListingResponse:
    return ListingResponse(
        id=row["id"],
        farmer_name=row.get("farmer_name"),
        crop_name=row["crop_name"],
        variety=row["variety"],
        quantity=float(row["quantity"]),
        unit=row["unit"],
        price=float(row["price"]),
        quality=row["quality"],
        location=row["location"],
        harvest_date=row["harvest_date"],
        image_url=signed_image_url,
        status=row["status"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _signed_image_url(
    image_path: str | None,
    user: AuthenticatedUser | None = None,
) -> str | None:
    if not image_path or not settings.supabase_url or not settings.supabase_service_role_key:
        return None

    safe_path = str(PurePosixPath(image_path))
    if safe_path != image_path or safe_path.startswith("/") or ".." in PurePosixPath(image_path).parts:
        return None

    endpoint = (
        f"{settings.supabase_url}/storage/v1/object/sign/"
        f"crop-images/{safe_path}"
    )
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                endpoint,
                headers={
                    "apikey": settings.supabase_service_role_key,
                    "Authorization": f"Bearer {settings.supabase_service_role_key}",
                    "Content-Type": "application/json",
                },
                json={"expiresIn": 3600},
            )
    except httpx.RequestError:
        return None

    if response.status_code != 200:
        return None

    try:
        signed_path = response.json()["signedURL"]
    except (KeyError, TypeError, ValueError):
        return None

    if not isinstance(signed_path, str):
        return None
    if signed_path.startswith("http://") or signed_path.startswith("https://"):
        return signed_path
    if signed_path.startswith("/storage/v1/"):
        return f"{settings.supabase_url}{signed_path}"
    if signed_path.startswith("/"):
        return f"{settings.supabase_url}/storage/v1{signed_path}"
    return f"{settings.supabase_url}/storage/v1/{signed_path}"


async def _with_signed_image(
    row: dict,
    user: AuthenticatedUser | None = None,
) -> ListingResponse:
    signed_url = await _signed_image_url(row["image_url"], user)
    farmer_photo_url = await signed_profile_photo_url(row.get("farmer_photo_path"))
    data = _response_data(row, signed_url).model_dump()
    data["farmer_user_id"] = row.get("farmer_user_id")
    data["farmer_photo_url"] = farmer_photo_url
    return ListingResponse(**data)


async def _listing_media(listing_id: UUID) -> list[ListingMediaResponse]:
    """Return short-lived URLs; storage keys and credentials never leave the server."""
    try:
        with get_engine().connect() as connection:
            rows = connection.execute(text("""
                SELECT id, media_type, storage_key, thumbnail_key, mime_type, file_size, sort_order
                FROM public.crop_listing_media WHERE listing_id = :listing_id ORDER BY sort_order, created_at
            """), {"listing_id": listing_id}).mappings().all()
    except SQLAlchemyError:
        return []  # supports deployments before migration 014 is applied
    return [ListingMediaResponse(id=row["id"], media_type=row["media_type"], url=await _signed_image_url(row["storage_key"]), thumbnail_url=await _signed_image_url(row["thumbnail_key"]), mime_type=row["mime_type"], file_size=row["file_size"], sort_order=row["sort_order"]) for row in rows]


async def _with_media(response: ListingResponse) -> ListingResponse:
    data = response.model_dump()
    data["media"] = await _listing_media(response.id)
    return ListingResponse(**data)


@public_router.get("", response_model=list[ListingResponse])
async def list_public_listings() -> list[ListingResponse]:
    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                  SELECT crop_listings.id, p.id AS farmer_user_id, p.profile_photo_path AS farmer_photo_path, crop_listings.crop_name, crop_listings.variety,
                      crop_listings.quantity, crop_listings.unit, crop_listings.price,
                      crop_listings.quality, crop_listings.location,
                      crop_listings.harvest_date, crop_listings.image_url,
                      crop_listings.status, crop_listings.created_at,
                      crop_listings.updated_at, p.name AS farmer_name
                FROM public.crop_listings
                  JOIN public.farmers AS f ON f.id = crop_listings.farmer_id
                  JOIN public.profiles AS p ON p.id = f.profile_id
                WHERE status = 'ACTIVE'
                ORDER BY created_at DESC
                """
            )
        ).mappings().all()
    return [await _with_media(await _with_signed_image(dict(row), None)) for row in rows]


@public_router.get("/{listing_id}", response_model=ListingResponse)
async def get_public_listing(listing_id: UUID) -> ListingResponse:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                  SELECT crop_listings.id, p.id AS farmer_user_id, p.profile_photo_path AS farmer_photo_path, crop_listings.crop_name, crop_listings.variety,
                      crop_listings.quantity, crop_listings.unit, crop_listings.price,
                      crop_listings.quality, crop_listings.location,
                      crop_listings.harvest_date, crop_listings.image_url,
                      crop_listings.status, crop_listings.created_at,
                      crop_listings.updated_at, p.name AS farmer_name
                  FROM public.crop_listings
                  JOIN public.farmers AS f ON f.id = crop_listings.farmer_id
                  JOIN public.profiles AS p ON p.id = f.profile_id
                  WHERE crop_listings.id = :listing_id
                    AND crop_listings.status = 'ACTIVE'
                """
            ),
            {"listing_id": listing_id},
        ).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crop listing not found.")
    return await _with_media(await _with_signed_image(dict(row), None))


async def _delete_image(image_path: str | None, user_id: UUID, listing_id: UUID) -> None:
    if not image_path or not settings.supabase_url or not settings.supabase_service_role_key:
        return

    safe_path = str(PurePosixPath(image_path))
    if safe_path != image_path or safe_path.startswith("/") or ".." in PurePosixPath(image_path).parts:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The crop image reference is invalid.",
        )
    expected_prefix = f"{user_id}/{listing_id}/"
    if not safe_path.startswith(expected_prefix):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The crop image reference does not belong to this listing.",
        )

    endpoint = f"{settings.supabase_url}/storage/v1/object/crop-images/{safe_path}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.delete(
                endpoint,
                headers={
                    "apikey": settings.supabase_service_role_key,
                    "Authorization": f"Bearer {settings.supabase_service_role_key}",
                },
            )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The crop image could not be removed.",
        ) from None

    if response.status_code not in {200, 204, 404}:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The crop image could not be removed.",
        )


@router.get("", response_model=list[ListingResponse])
async def list_farmer_listings(
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[ListingResponse]:
    farmer_id = _farmer_id(user)
    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT id, crop_name, variety, quantity, unit, price, quality,
                       location, harvest_date, image_url, status, created_at,
                       updated_at
                FROM public.crop_listings
                WHERE farmer_id = :farmer_id
                ORDER BY created_at DESC
                """
            ),
            {"farmer_id": farmer_id},
        ).mappings().all()
    return [await _with_media(await _with_signed_image(dict(row), user)) for row in rows]


@router.post("", response_model=ListingResponse, status_code=status.HTTP_201_CREATED)
async def create_farmer_listing(
    payload: ListingCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> ListingResponse:
    farmer_id = _farmer_id(user)
    try:
        with get_engine().begin() as connection:
            row = connection.execute(
                text(
                    """
                    INSERT INTO public.crop_listings
                        (farmer_id, crop_name, variety, quantity, unit, price,
                         quality, location, harvest_date)
                    VALUES
                        (:farmer_id, :crop_name, :variety, :quantity, :unit, :price,
                         :quality, :location, :harvest_date)
                    RETURNING id, crop_name, variety, quantity, unit, price, quality,
                              location, harvest_date, image_url, status, created_at,
                              updated_at
                    """
                ),
                {
                    "farmer_id": farmer_id,
                    **payload.model_dump(),
                },
            ).mappings().one()
    except SQLAlchemyError:
        raise _friendly_database_error() from None
    return await _with_media(await _with_signed_image(dict(row), user))


@router.get("/{listing_id}", response_model=ListingResponse)
async def get_farmer_listing(
    listing_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
) -> ListingResponse:
    farmer_id = _farmer_id(user)
    row = _listing_row(listing_id, farmer_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Crop listing not found.",
        )
    return await _with_signed_image(row, user)


@router.patch("/{listing_id}", response_model=ListingResponse)
async def update_farmer_listing(
    listing_id: UUID,
    payload: ListingUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> ListingResponse:
    farmer_id = _farmer_id(user)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one listing field to update.",
        )

    set_clauses = [
        f"{field_name} = :{field_name}" for field_name in changes
    ]
    set_clauses.append("updated_at = now()")
    try:
        with get_engine().begin() as connection:
            row = connection.execute(
                text(
                    f"""
                    UPDATE public.crop_listings
                    SET {", ".join(set_clauses)}
                    WHERE id = :listing_id
                      AND farmer_id = :farmer_id
                    RETURNING id, crop_name, variety, quantity, unit, price, quality,
                              location, harvest_date, image_url, status, created_at,
                              updated_at
                    """
                ),
                {
                    **changes,
                    "listing_id": listing_id,
                    "farmer_id": farmer_id,
                },
            ).mappings().one_or_none()
    except SQLAlchemyError:
        raise _friendly_database_error() from None

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Crop listing not found.",
        )
    return await _with_signed_image(dict(row), user)


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_farmer_listing(
    listing_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    farmer_id = _farmer_id(user)
    row = _listing_row(listing_id, farmer_id)
    if row is None:
        with get_engine().connect() as connection:
            exists = connection.execute(
                text("SELECT EXISTS (SELECT 1 FROM public.crop_listings WHERE id = :listing_id)"),
                {"listing_id": listing_id},
            ).scalar()
        if exists:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this crop listing.",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Crop listing not found.",
        )

    with get_engine().connect() as connection:
        has_orders = connection.execute(
            text("SELECT EXISTS (SELECT 1 FROM public.order_items WHERE crop_listing_id = :listing_id)"),
            {"listing_id": listing_id},
        ).scalar()
    if has_orders:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This listing cannot be deleted because it has order history.",
        )

    await _delete_image(row["image_url"], user.id, listing_id)
    try:
        with get_engine().begin() as connection:
            deleted = connection.execute(
                text(
                    """
                    DELETE FROM public.crop_listings
                    WHERE id = :listing_id
                      AND farmer_id = :farmer_id
                    RETURNING id
                    """
                ),
                {"listing_id": listing_id, "farmer_id": farmer_id},
            ).scalar_one_or_none()
    except SQLAlchemyError:
        raise _friendly_database_error() from None

    if deleted is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Crop listing not found.",
        )


@router.post("/{listing_id}/media", response_model=ListingMediaResponse, status_code=status.HTTP_201_CREATED)
async def upload_farmer_listing_media(
    listing_id: UUID,
    file: Annotated[UploadFile, File(...)],
    user: AuthenticatedUser = Depends(get_current_user),
) -> ListingMediaResponse:
    """Upload a bounded, signature-checked listing asset owned by the authenticated farmer."""
    farmer_id = _farmer_id(user)
    if _listing_row(listing_id, farmer_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crop listing not found.")
    content_type = (file.content_type or "").lower()
    image_ext = IMAGE_CONTENT_TYPES.get(content_type)
    video_ext = VIDEO_CONTENT_TYPES.get(content_type)
    if not image_ext and not video_ext:
        raise HTTPException(status_code=400, detail="Unsupported media. Upload JPG, PNG, WebP, MP4, WebM, or MOV.")
    limit = MAX_IMAGE_BYTES if image_ext else MAX_VIDEO_BYTES
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(status_code=413, detail=("Crop images must be 5 MB or smaller." if image_ext else "Crop videos must be 50 MB or smaller."))
    if image_ext and (not any(content.startswith(signature) for signature in IMAGE_SIGNATURES[image_ext]) or (image_ext == "webp" and content[8:12] != b"WEBP")):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid crop image.")
    if video_ext and not ((video_ext in {"mp4", "mov"} and content[4:8] == b"ftyp") or (video_ext == "webm" and content.startswith(b"\x1a\x45\xdf\xa3"))):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid crop video.")
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="Media storage is not configured on the server.")
    media_type = "IMAGE" if image_ext else "VIDEO"
    extension = image_ext or video_ext
    storage_key = f"{user.id}/{listing_id}/{media_type.lower()}-{uuid4().hex}.{extension}"
    try:
        with get_engine().connect() as connection:
            current_count = connection.execute(text("SELECT count(*) FROM public.crop_listing_media WHERE listing_id = :listing_id AND media_type = :media_type"), {"listing_id": listing_id, "media_type": media_type}).scalar_one()
        if (media_type == "IMAGE" and current_count >= 8) or (media_type == "VIDEO" and current_count >= 1):
            raise HTTPException(status_code=400, detail=("A listing can have up to 8 photos." if media_type == "IMAGE" else "A listing can have one crop video."))
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(f"{settings.supabase_url}/storage/v1/object/crop-images/{storage_key}", headers={"apikey": settings.supabase_service_role_key, "Authorization": f"Bearer {settings.supabase_service_role_key}", "Content-Type": content_type, "x-upsert": "false"}, content=content)
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail="The crop media could not be uploaded.")
        with get_engine().begin() as connection:
            sort_order = connection.execute(text("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM public.crop_listing_media WHERE listing_id = :listing_id"), {"listing_id": listing_id}).scalar_one()
            row = connection.execute(text("""
                INSERT INTO public.crop_listing_media(listing_id, media_type, storage_key, mime_type, file_size, sort_order)
                VALUES (:listing_id, :media_type, :storage_key, :mime_type, :file_size, :sort_order)
                RETURNING id, media_type, storage_key, thumbnail_key, mime_type, file_size, sort_order
            """), {"listing_id": listing_id, "media_type": media_type, "storage_key": storage_key, "mime_type": content_type, "file_size": len(content), "sort_order": sort_order}).mappings().one()
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Media storage is temporarily unavailable.") from None
    except SQLAlchemyError:
        raise _friendly_database_error() from None
    return ListingMediaResponse(id=row["id"], media_type=row["media_type"], url=await _signed_image_url(row["storage_key"]), mime_type=row["mime_type"], file_size=row["file_size"], sort_order=row["sort_order"])


@router.delete("/{listing_id}/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_farmer_listing_media(
    listing_id: UUID, media_id: UUID, user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    farmer_id = _farmer_id(user)
    if _listing_row(listing_id, farmer_id) is None:
        raise HTTPException(status_code=404, detail="Crop listing not found.")
    try:
        with get_engine().begin() as connection:
            row = connection.execute(text("""
                DELETE FROM public.crop_listing_media WHERE id = :media_id AND listing_id = :listing_id
                RETURNING storage_key
            """), {"media_id": media_id, "listing_id": listing_id}).mappings().one_or_none()
    except SQLAlchemyError:
        raise _friendly_database_error() from None
    if row is None:
        raise HTTPException(status_code=404, detail="Crop media not found.")
    # The path is generated by this service and bound to the authenticated listing before deletion.
    await _delete_image(row["storage_key"], user.id, listing_id)


@router.post("/{listing_id}/image", response_model=ListingResponse)
async def upload_farmer_listing_image(
    listing_id: UUID,
    file: Annotated[UploadFile, File(...)],
    user: AuthenticatedUser = Depends(get_current_user),
) -> ListingResponse:
    farmer_id = _farmer_id(user)
    row = _listing_row(listing_id, farmer_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Crop listing not found.",
        )

    extension = IMAGE_CONTENT_TYPES.get(file.content_type or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload a JPG, PNG, or WebP crop image.",
        )

    image_bytes = await file.read(MAX_IMAGE_BYTES + 1)
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Crop images must be 5 MB or smaller.",
        )

    signatures = IMAGE_SIGNATURES[extension]
    if not any(image_bytes.startswith(signature) for signature in signatures):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is not a valid crop image.",
        )
    if extension == "webp" and image_bytes[8:12] != b"WEBP":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is not a valid WebP image.",
        )

    image_path = f"{user.id}/{listing_id}/image.{extension}"
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image storage is not configured on the server.",
        )
    endpoint = f"{settings.supabase_url}/storage/v1/object/crop-images/{image_path}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                endpoint,
                headers={
                    "apikey": settings.supabase_service_role_key,
                    "Authorization": f"Bearer {settings.supabase_service_role_key}",
                    "Content-Type": file.content_type or "",
                    "x-upsert": "true",
                },
                content=image_bytes,
            )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Image storage is temporarily unavailable.",
        ) from None

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The crop image could not be uploaded.",
        )

    try:
        with get_engine().begin() as connection:
            updated = connection.execute(
                text(
                    """
                    UPDATE public.crop_listings
                    SET image_url = :image_path, updated_at = now()
                    WHERE id = :listing_id
                      AND farmer_id = :farmer_id
                    RETURNING id, crop_name, variety, quantity, unit, price, quality,
                              location, harvest_date, image_url, status, created_at,
                              updated_at
                    """
                ),
                {
                    "image_path": image_path,
                    "listing_id": listing_id,
                    "farmer_id": farmer_id,
                },
            ).mappings().one_or_none()
    except SQLAlchemyError:
        raise _friendly_database_error() from None

    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Crop listing not found.",
        )
    return await _with_signed_image(dict(updated), user)
