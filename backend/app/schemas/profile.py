from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


VerificationStatus = Literal["NOT_SUBMITTED", "PENDING", "VERIFIED", "REJECTED", "FAILED"]


class ProfileUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    mobile: str | None = Field(default=None, max_length=40)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=2000)
    address: str | None = Field(default=None, max_length=240)
    locality: str | None = Field(default=None, max_length=160)
    landmark: str | None = Field(default=None, max_length=160)
    pin_code: str | None = Field(default=None, max_length=12)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    farm_name: str | None = Field(default=None, max_length=160)
    farm_location: str | None = Field(default=None, max_length=160)
    crops_grown: str | None = Field(default=None, max_length=500)
    farming_experience: str | None = Field(default=None, max_length=120)
    farm_description: str | None = Field(default=None, max_length=2000)
    farm_size: float | None = Field(default=None, gt=0, le=1000000)
    farm_size_unit: Literal["acres", "hectares"] | None = None
    farming_type: Literal["Organic", "Conventional", "Mixed", "Other"] | None = None
    business_name: str | None = Field(default=None, max_length=160)
    buyer_type: str | None = Field(default=None, max_length=120)
    purchasing_interests: str | None = Field(default=None, max_length=500)
    preferred_crops: str | None = Field(default=None, max_length=500)
    business_location: str | None = Field(default=None, max_length=160)
    delivery_address: str | None = Field(default=None, max_length=240)
    service_area: str | None = Field(default=None, max_length=160)
    vehicle_type: str | None = Field(default=None, max_length=80)
    vehicle_registration: str | None = Field(default=None, max_length=80)

    @field_validator("name", "mobile", "city", "state", "bio", "address", "locality", "landmark", "pin_code", "farm_name", "farm_location", "crops_grown", "farming_experience", "farm_description", "business_name", "buyer_type", "purchasing_interests", "preferred_crops", "business_location", "delivery_address", "service_area", "vehicle_type", "vehicle_registration", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value

    @field_validator("latitude", "longitude", "farm_size", mode="before")
    @classmethod
    def normalize_optional_float(cls, value: float | str | None) -> float | None:
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned == "":
                return None
            return float(cleaned)
        return value

    @field_validator("name", "mobile", "city", "state", "bio", "address", "locality", "landmark", "pin_code", "farm_name", "farm_location", "crops_grown", "farming_experience", "farm_description", "business_name", "buyer_type", "purchasing_interests", "preferred_crops", "business_location", "delivery_address", "service_area", "vehicle_type", "vehicle_registration")
    @classmethod
    def trim_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class VerificationResponse(BaseModel):
    status: VerificationStatus
    masked_identifier: str | None = None
    provider: str | None = None
    name_match: bool | None = None
    verified_at: datetime | None = None


class ProfileResponse(BaseModel):
    id: UUID
    name: str
    email: str | None
    role: str
    email_verified: bool
    email_verified_at: datetime | None = None
    profile_photo_url: str | None = None
    mobile: str | None = None
    phone_verified: bool = False
    phone_verified_at: datetime | None = None
    city: str | None = None
    state: str | None = None
    location: str | None = None
    bio: str | None = None
    address: str | None = None
    locality: str | None = None
    landmark: str | None = None
    pin_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    farm_name: str | None = None
    farm_location: str | None = None
    crops_grown: str | None = None
    farming_experience: str | None = None
    farm_description: str | None = None
    farm_size: float | None = None
    farm_size_unit: str | None = None
    farming_type: str | None = None
    business_name: str | None = None
    buyer_type: str | None = None
    purchasing_interests: str | None = None
    preferred_crops: str | None = None
    business_location: str | None = None
    delivery_address: str | None = None
    driver_id: UUID | None = None
    service_area: str | None = None
    vehicle_type: str | None = None
    vehicle_registration: str | None = None
    availability_status: str | None = None
    approval_status: str | None = None
    preferred_otp_method: str = "EMAIL"
    completion_percent: int
    pan_verification: VerificationResponse
    created_at: datetime