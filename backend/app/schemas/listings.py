"""Pydantic contracts for authenticated farmer crop listings."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


ListingStatus = Literal["ACTIVE", "SOLD", "INACTIVE"]


class ListingMediaResponse(BaseModel):
    id: UUID
    media_type: Literal["IMAGE", "VIDEO"]
    url: str | None = None
    thumbnail_url: str | None = None
    mime_type: str
    file_size: int
    sort_order: int


def _trim_required(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("This field cannot be empty.")
    return trimmed


def _trim_optional(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


class ListingCreateRequest(BaseModel):
    crop_name: str = Field(min_length=1, max_length=120)
    variety: str | None = Field(default=None, max_length=120)
    quantity: Decimal = Field(gt=0, le=10_000_000)
    unit: str = Field(min_length=1, max_length=32)
    price: Decimal = Field(ge=0, le=100_000_000)
    quality: str | None = Field(default=None, max_length=80)
    location: str = Field(min_length=1, max_length=160)
    harvest_date: date | None = None

    @field_validator("crop_name", "unit", "location")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        return _trim_required(value)

    @field_validator("variety", "quality")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        return _trim_optional(value)


class ListingUpdateRequest(BaseModel):
    crop_name: str | None = Field(default=None, min_length=1, max_length=120)
    variety: str | None = Field(default=None, max_length=120)
    quantity: Decimal | None = Field(default=None, gt=0, le=10_000_000)
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    price: Decimal | None = Field(default=None, ge=0, le=100_000_000)
    quality: str | None = Field(default=None, max_length=80)
    location: str | None = Field(default=None, min_length=1, max_length=160)
    harvest_date: date | None = None
    status: ListingStatus | None = None

    @field_validator("crop_name", "unit", "location")
    @classmethod
    def validate_optional_required_text(cls, value: str | None) -> str | None:
        return _trim_required(value) if value is not None else None

    @field_validator("variety", "quality")
    @classmethod
    def trim_optional_update_text(cls, value: str | None) -> str | None:
        return _trim_optional(value)


class ListingResponse(BaseModel):
    id: UUID
    farmer_user_id: UUID | None = None
    farmer_name: str | None = None
    farmer_photo_url: str | None = None
    crop_name: str
    variety: str | None
    quantity: float
    unit: str
    price: float
    quality: str | None
    location: str
    harvest_date: date | None
    image_url: str | None
    status: ListingStatus
    created_at: datetime
    updated_at: datetime
    crop_id: UUID | None = None
    variety_id: UUID | None = None
    farmer_entered_variety: str | None = None
    price_unit: str | None = None
    available_from: date | None = None
    description: str | None = None
    media: list[ListingMediaResponse] = []
