"""Private call orchestration utilities backed by PostgreSQL."""

from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import text

from ..auth import AuthenticatedUser
from ..database.connection import get_engine

CALL_EXPIRATION_SECONDS = 60
logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _load_order(connection, order_id: UUID):
    return connection.execute(
        text(
            """
            SELECT o.id, o.buyer_id, o.farmer_id, o.status AS order_status,
                   b.profile_id AS buyer_profile_id,
                   f.profile_id AS farmer_profile_id,
                   p.name AS farmer_name, p.profile_photo_path AS farmer_photo_path,
                   cl.crop_name
            FROM public.orders o
            JOIN public.buyers b ON b.id = o.buyer_id
            JOIN public.farmers f ON f.id = o.farmer_id
            JOIN public.profiles p ON p.id = f.profile_id
            LEFT JOIN public.order_items oi ON oi.order_id = o.id
            LEFT JOIN public.crop_listings cl ON cl.id = oi.crop_listing_id
            WHERE o.id = :order_id
            ORDER BY oi.created_at ASC
            LIMIT 1
            """
        ),
        {"order_id": order_id},
    ).mappings().one_or_none()


def _ensure_valid_order_for_call(connection, buyer_id: UUID, order_id: UUID):
    order = connection.execute(
        text(
            """
            SELECT o.id, o.buyer_id, o.farmer_id, o.status AS order_status,
                   f.profile_id AS farmer_profile_id, p.name AS farmer_name, p.profile_photo_path AS farmer_photo_path
            FROM public.orders o
            JOIN public.farmers f ON f.id = o.farmer_id
            JOIN public.profiles p ON p.id = f.profile_id
            WHERE o.id = :order_id AND o.buyer_id = :buyer_id
            FOR UPDATE
            """
        ),
        {"order_id": order_id, "buyer_id": buyer_id},
    ).mappings().one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Order does not belong to the authenticated buyer.")
    if order["order_status"] not in {"PENDING", "ACCEPTED", "PROCESSING", "OUT_FOR_DELIVERY"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Order is not in a valid state for a private call.")
    return order


def _get_buyer_id(connection, user: AuthenticatedUser) -> UUID:
    if user.role not in {"BUYER", "CONSUMER"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only buyer and consumer accounts can call farmers.")
    buyer_id = connection.execute(
        text("SELECT id FROM public.buyers WHERE profile_id = :profile_id"),
        {"profile_id": user.id},
    ).scalar_one_or_none()
    if buyer_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Buyer profile not found.")
    return buyer_id


def _get_farmer_id(connection, user: AuthenticatedUser) -> UUID:
    farmer_id = connection.execute(
        text("SELECT id FROM public.farmers WHERE profile_id = :profile_id"),
        {"profile_id": user.id},
    ).scalar_one_or_none()
    if farmer_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Farmer profile not found.")
    return farmer_id


def _call_status_for_transition(current: str, target: str) -> bool:
    allowed = {
        "RINGING": {"ACCEPTED", "DECLINED", "EXPIRED", "ENDED"},
        "ACCEPTED": {"ACTIVE", "ENDED", "DECLINED"},
        "ACTIVE": {"ENDED"},
        "DECLINED": set(),
        "ENDED": set(),
        "EXPIRED": set(),
    }
    return target in allowed.get(current, set())


def _serialize_call_row(row: dict | None) -> dict | None:
    if row is None:
        return None
    return {
        "call_id": row["call_id"],
        "order_id": row["order_id"],
        "status": row["status"],
        "farmer_name": row["farmer_name"],
        "crop_name": row.get("crop_name"),
        "farmer_profile_id": row["farmer_profile_id"],
        "farmer_photo_path": row.get("farmer_photo_path"),
        "expires_at": row["expires_at"],
        "accepted_at": row.get("accepted_at"),
        "ended_at": row.get("ended_at"),
    }


def ensure_no_conflicting_call(connection, buyer_id: UUID, farmer_id: UUID, order_id: UUID) -> None:
    active_call = connection.execute(
        text(
            """
            SELECT id FROM public.call_sessions
            WHERE buyer_id = :buyer_id AND farmer_id = :farmer_id AND order_id = :order_id
              AND status IN ('RINGING', 'ACCEPTED', 'ACTIVE')
              AND expires_at > now()
            LIMIT 1
            """
        ),
        {"buyer_id": buyer_id, "farmer_id": farmer_id, "order_id": order_id},
    ).scalar_one_or_none()
    if active_call is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A call for this order is already active or ringing.")


def get_ice_config() -> dict:
    stun_urls = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]
    provider_urls = os.getenv("TURN_ICE_URLS", "")
    turn_user = os.getenv("TURN_USERNAME", "").strip()
    turn_credential = os.getenv("TURN_CREDENTIAL", "").strip()
    turn_urls = [entry.strip() for entry in provider_urls.split(",") if entry.strip()]
    valid_turn_urls = [
        url for url in turn_urls if url.startswith(("turn:", "turns:"))
    ]
    ice_servers = [{"urls": stun_urls}]
    turn_configured = bool(valid_turn_urls and turn_user and turn_credential)
    if turn_configured:
        ice_servers.append(
            {
                "urls": valid_turn_urls,
                "username": turn_user,
                "credential": turn_credential,
            }
        )
    logger.info(
        "ICE_CONFIG STUN=true TURN=%s TURN_URL_COUNT=%d",
        turn_configured,
        len(valid_turn_urls),
    )
    return {"ice_servers": ice_servers, "turn_configured": turn_configured}


def create_call_record(connection, buyer_id: UUID, farmer_id: UUID, order_id: UUID) -> dict:
    expires_at = _utc_now() + timedelta(seconds=CALL_EXPIRATION_SECONDS)
    call_id = uuid4()
    connection.execute(
        text(
            """
            INSERT INTO public.call_sessions (
                id, buyer_id, farmer_id, order_id, status, created_at, expires_at
            ) VALUES (:call_id, :buyer_id, :farmer_id, :order_id, 'RINGING', now(), :expires_at)
            """
        ),
        {"call_id": call_id, "buyer_id": buyer_id, "farmer_id": farmer_id, "order_id": order_id, "expires_at": expires_at},
    )
    row = connection.execute(
        text(
            """
            SELECT c.id AS call_id, c.order_id, c.status, c.expires_at, c.accepted_at, c.ended_at,
                   p.name AS farmer_name, p.profile_photo_path AS farmer_photo_path,
                   cl.crop_name,
                   f.profile_id AS farmer_profile_id
            FROM public.call_sessions c
            JOIN public.farmers f ON f.id = c.farmer_id
            JOIN public.profiles p ON p.id = f.profile_id
            LEFT JOIN public.order_items oi ON oi.order_id = c.order_id
            LEFT JOIN public.crop_listings cl ON cl.id = oi.crop_listing_id
            WHERE c.id = :call_id
            LIMIT 1
            """
        ),
        {"call_id": call_id},
    ).mappings().one()
    return _serialize_call_row(dict(row))


def get_call_for_user(connection, call_id: UUID, user: AuthenticatedUser) -> dict:
    call = connection.execute(
        text(
            """
            SELECT c.id AS call_id, c.order_id, c.status, c.expires_at, c.accepted_at, c.ended_at,
                   p.name AS farmer_name, p.profile_photo_path AS farmer_photo_path,
                   cl.crop_name,
                   f.profile_id AS farmer_profile_id,
                   c.buyer_id, c.farmer_id
            FROM public.call_sessions c
            JOIN public.farmers f ON f.id = c.farmer_id
            JOIN public.profiles p ON p.id = f.profile_id
            LEFT JOIN public.order_items oi ON oi.order_id = c.order_id
            LEFT JOIN public.crop_listings cl ON cl.id = oi.crop_listing_id
            WHERE c.id = :call_id
            LIMIT 1
            """
        ),
        {"call_id": call_id},
    ).mappings().one_or_none()
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found.")
    buyer_id = connection.execute(text("SELECT id FROM public.buyers WHERE profile_id = :profile_id"), {"profile_id": user.id}).scalar_one_or_none()
    farmer_id = connection.execute(text("SELECT id FROM public.farmers WHERE profile_id = :profile_id"), {"profile_id": user.id}).scalar_one_or_none()
    if buyer_id != call["buyer_id"] and farmer_id != call["farmer_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this call.")
    return _serialize_call_row(dict(call))


def list_calls_for_user(connection, user: AuthenticatedUser) -> list[dict]:
    buyer_id = connection.execute(
        text("SELECT id FROM public.buyers WHERE profile_id = :profile_id"),
        {"profile_id": user.id},
    ).scalar_one_or_none()
    farmer_id = connection.execute(
        text("SELECT id FROM public.farmers WHERE profile_id = :profile_id"),
        {"profile_id": user.id},
    ).scalar_one_or_none()
    rows = connection.execute(
        text(
            """
            SELECT c.id AS call_id, c.order_id, c.status, c.expires_at,
                   c.accepted_at, c.ended_at, p.name AS farmer_name, p.profile_photo_path AS farmer_photo_path,
                   cl.crop_name, f.profile_id AS farmer_profile_id
            FROM public.call_sessions c
            JOIN public.farmers f ON f.id = c.farmer_id
            JOIN public.profiles p ON p.id = f.profile_id
            LEFT JOIN public.order_items oi ON oi.order_id = c.order_id
            LEFT JOIN public.crop_listings cl ON cl.id = oi.crop_listing_id
            WHERE (:buyer_id IS NOT NULL AND c.buyer_id = :buyer_id)
               OR (:farmer_id IS NOT NULL AND c.farmer_id = :farmer_id)
            ORDER BY c.created_at DESC
            LIMIT 20
            """
        ),
        {"buyer_id": buyer_id, "farmer_id": farmer_id},
    ).mappings()
    return [_serialize_call_row(dict(row)) for row in rows]


def update_call_status(connection, call_id: UUID, new_status: str, actor_user: AuthenticatedUser, actor_role: str) -> dict:
    call = connection.execute(
        text(
            """
            SELECT c.id AS call_id, c.order_id, c.status, c.expires_at, c.accepted_at, c.ended_at,
                   c.buyer_id, c.farmer_id, p.name AS farmer_name, p.profile_photo_path AS farmer_photo_path,
                   cl.crop_name, f.profile_id AS farmer_profile_id
            FROM public.call_sessions c
            JOIN public.farmers f ON f.id = c.farmer_id
            JOIN public.profiles p ON p.id = f.profile_id
            LEFT JOIN public.order_items oi ON oi.order_id = c.order_id
            LEFT JOIN public.crop_listings cl ON cl.id = oi.crop_listing_id
            WHERE c.id = :call_id
            FOR UPDATE OF c
            """
        ),
        {"call_id": call_id},
    ).mappings().one_or_none()
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found.")
    if call["status"] == "EXPIRED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This call has expired.")
    if call["status"] == "DECLINED" or call["status"] == "ENDED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This call is no longer active.")
    if not _call_status_for_transition(call["status"], new_status):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invalid call state transition.")
    buyer_profile_id = connection.execute(text("SELECT profile_id FROM public.buyers WHERE id = :buyer_id"), {"buyer_id": call["buyer_id"]}).scalar_one()
    farmer_profile_id = connection.execute(text("SELECT profile_id FROM public.farmers WHERE id = :farmer_id"), {"farmer_id": call["farmer_id"]}).scalar_one()
    if actor_role == "BUYER" and str(buyer_profile_id) != str(actor_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage another buyer's call.")
    if actor_role == "FARMER" and str(farmer_profile_id) != str(actor_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage another farmer's call.")
    accepted_at = call["accepted_at"]
    ended_at = call["ended_at"]
    if new_status == "ACCEPTED" and accepted_at is None:
        accepted_at = _utc_now()
    if new_status == "ENDED":
        ended_at = _utc_now()
    connection.execute(
        text(
            """
            UPDATE public.call_sessions
            SET status = :new_status,
                accepted_at = :accepted_at,
                ended_at = :ended_at,
                ended_by = :ended_by,
                expires_at = COALESCE(expires_at, now())
            WHERE id = :call_id
            """
        ),
        {
            "new_status": new_status,
            "accepted_at": accepted_at,
            "ended_at": ended_at,
            "ended_by": actor_user.id,
            "call_id": call_id,
        },
    )
    call["status"] = new_status
    call["accepted_at"] = accepted_at
    call["ended_at"] = ended_at
    return _serialize_call_row(call)
