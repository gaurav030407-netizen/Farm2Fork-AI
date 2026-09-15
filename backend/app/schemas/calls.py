"""Request and response contracts for private call sessions."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

CallStatus = Literal["RINGING", "ACCEPTED", "ACTIVE", "DECLINED", "ENDED", "EXPIRED"]


class CallCreateRequest(BaseModel):
    order_id: UUID = Field(..., description="The authenticated buyer's PostgreSQL order id.")


class CallResponse(BaseModel):
    call_id: UUID
    order_id: UUID
    status: CallStatus
    farmer_name: str
    farmer_photo_url: str | None = None
    crop_name: str | None = None
    farmer_profile_id: UUID
    expires_at: datetime
    accepted_at: datetime | None = None
    ended_at: datetime | None = None


class IceServerConfig(BaseModel):
    urls: list[str]
    username: str | None = None
    credential: str | None = None


class IceConfigResponse(BaseModel):
    ice_servers: list[IceServerConfig]
    turn_configured: bool
