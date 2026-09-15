"""Private call endpoints for authenticated buyer/farmer voice sessions."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text

from ..auth import AuthenticatedUser, get_current_user
from ..database.connection import get_engine
from ..schemas.calls import CallCreateRequest, CallResponse, IceConfigResponse
from ..services.calls import (
    CALL_EXPIRATION_SECONDS,
    _ensure_valid_order_for_call,
    _get_buyer_id,
    _get_farmer_id,
    create_call_record,
    ensure_no_conflicting_call,
    get_call_for_user,
    list_calls_for_user,
    get_ice_config,
    update_call_status,
)
from ..services.profile_media import signed_profile_photo_url

router = APIRouter(prefix="/api", tags=["calls"])
logger = logging.getLogger(__name__)


async def _call_response(row: dict) -> CallResponse:
    row = dict(row)
    row["farmer_photo_url"] = await signed_profile_photo_url(row.pop("farmer_photo_path", None))
    return CallResponse(**row)


def _require_call_role(user: AuthenticatedUser, allowed: set[str]) -> None:
    if user.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This action requires one of: {', '.join(sorted(allowed))}.",
        )


@router.post("/calls", response_model=CallResponse)
async def create_call(payload: CallCreateRequest, user: AuthenticatedUser = Depends(get_current_user)) -> CallResponse:
    _require_call_role(user, {"BUYER", "CONSUMER"})
    try:
        with get_engine().begin() as connection:
            buyer_id = _get_buyer_id(connection, user)
            order = _ensure_valid_order_for_call(connection, buyer_id, payload.order_id)
            farmer_id = order["farmer_id"]
            ensure_no_conflicting_call(connection, buyer_id, farmer_id, payload.order_id)
            call = create_call_record(connection, buyer_id, farmer_id, payload.order_id)
            return await _call_response({
                "call_id": call["call_id"],
                "order_id": call["order_id"],
                "status": "RINGING",
                "farmer_name": call["farmer_name"],
                "crop_name": call.get("crop_name"),
                "farmer_profile_id": call["farmer_profile_id"],
                "farmer_photo_path": call.get("farmer_photo_path"),
                "expires_at": call["expires_at"],
            })
    except HTTPException:
        raise
    except Exception as error:
        logger.exception(
            "CALL_CREATE_ERROR order_id=%s user_id=%s error_type=%s error_message=%s",
            payload.order_id,
            user.id,
            type(error).__name__,
            str(error),
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Call creation failed.") from error


@router.get("/calls", response_model=list[CallResponse])
async def list_calls(user: AuthenticatedUser = Depends(get_current_user)) -> list[CallResponse]:
    _require_call_role(user, {"BUYER", "CONSUMER", "FARMER"})
    with get_engine().connect() as connection:
        calls = list_calls_for_user(connection, user)
    return [await _call_response(call) for call in calls]


@router.post("/calls/{call_id}/accept", response_model=CallResponse)
async def accept_call(call_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> CallResponse:
    _require_call_role(user, {"FARMER"})
    with get_engine().begin() as connection:
        call = get_call_for_user(connection, call_id, user)
        if call["status"] != "RINGING":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only a ringing call can be accepted.")
        if call["expires_at"] <= __import__("datetime").datetime.now(__import__("datetime").timezone.utc):
            connection.execute(text("UPDATE public.call_sessions SET status = 'EXPIRED', expires_at = now() WHERE id = :call_id"), {"call_id": call_id})
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This call expired before it could be accepted.")
        updated = update_call_status(connection, call_id, "ACCEPTED", user, user.role)
    return await _call_response(updated)


@router.post("/calls/{call_id}/decline", response_model=CallResponse)
async def decline_call(call_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> CallResponse:
    _require_call_role(user, {"FARMER"})
    with get_engine().begin() as connection:
        call = get_call_for_user(connection, call_id, user)
        if call["status"] in {"DECLINED", "ENDED", "EXPIRED"}:
            return await _call_response(call)
        if call["status"] not in {"RINGING", "ACCEPTED"}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This call cannot be declined in its current state.")
        updated = update_call_status(connection, call_id, "DECLINED", user, user.role)
    return await _call_response(updated)


@router.post("/calls/{call_id}/end", response_model=CallResponse)
async def end_call(call_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> CallResponse:
    if user.role not in {"BUYER", "CONSUMER", "FARMER"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only participants can end a call.")
    with get_engine().begin() as connection:
        call = get_call_for_user(connection, call_id, user)
        if call["status"] not in {"RINGING", "ACCEPTED", "ACTIVE"}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This call can no longer be ended.")
        updated = update_call_status(connection, call_id, "ENDED", user, user.role)
    return await _call_response(updated)


@router.get("/calls/ice-config", response_model=IceConfigResponse)
async def get_call_ice_config(user: AuthenticatedUser = Depends(get_current_user)) -> IceConfigResponse:
    _require_call_role(user, {"BUYER", "CONSUMER", "FARMER"})
    cfg = get_ice_config()
    return IceConfigResponse(**cfg)


@router.get("/calls/{call_id}", response_model=CallResponse)
async def get_call(call_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> CallResponse:
    with get_engine().connect() as connection:
        call = get_call_for_user(connection, call_id, user)
    return await _call_response(call)
