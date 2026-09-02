"""Schemas for Supabase Auth identity and profile onboarding."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


ProfileRole = Literal["FARMER", "BUYER", "ADMIN"]
RegistrationRole = Literal["FARMER", "BUYER"]


class AuthMeResponse(BaseModel):
    id: UUID
    email: str | None
    role: ProfileRole


class ProfileCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: RegistrationRole
    mobile: str | None = Field(default=None, max_length=40)
    location: str | None = Field(default=None, max_length=160)
    farm_name: str | None = Field(default=None, max_length=160)
    business_name: str | None = Field(default=None, max_length=160)

    @field_validator("name", "mobile", "location", "farm_name", "business_name")
    @classmethod
    def trim_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None

    @model_validator(mode="after")
    def require_role_specific_name(self) -> "ProfileCreateRequest":
        if self.role == "FARMER" and not self.farm_name:
            raise ValueError("farm_name is required for a farmer profile.")
        if self.role == "BUYER" and not self.business_name:
            raise ValueError("business_name is required for a buyer profile.")
        if not self.location:
            raise ValueError("location is required.")
        return self


class ProfileResponse(AuthMeResponse):
    farmer_id: UUID | None = None
    buyer_id: UUID | None = None