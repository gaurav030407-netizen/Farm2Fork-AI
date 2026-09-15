from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DriverProfileResponse(BaseModel):
    id: UUID
    service_area: str
    vehicle_type: str
    vehicle_registration: str | None
    availability_status: str
    approval_status: str
    current_latitude: float | None
    current_longitude: float | None
    location_updated_at: datetime | None


class DriverProfileUpdate(BaseModel):
    service_area: str | None = Field(default=None, min_length=1, max_length=160)
    vehicle_type: str | None = Field(default=None, min_length=1, max_length=80)
    vehicle_registration: str | None = Field(default=None, max_length=80)
    availability_status: str | None = None
    current_latitude: float | None = Field(default=None, ge=-90, le=90)
    current_longitude: float | None = Field(default=None, ge=-180, le=180)


class DeliveryJobResponse(BaseModel):
    id: UUID
    order_id: UUID
    status: str
    pickup_location: str
    delivery_location: str
    estimated_distance_km: float | None
    farmer_name: str | None
    buyer_name: str | None
    quantity_summary: str | None
    created_at: datetime
    accepted_at: datetime | None
    picked_up_at: datetime | None
    delivered_at: datetime | None


class VerificationRequest(BaseModel):
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class PaymentCreateResponse(BaseModel):
    payment_id: UUID
    status: str
    amount: float
    currency: str
    gateway_reference: str | None
    gateway_public_key: str | None = None


class PaymentVerifyRequest(BaseModel):
    razorpay_order_id: str = Field(min_length=1, max_length=200)
    razorpay_payment_id: str = Field(min_length=1, max_length=200)
    razorpay_signature: str = Field(min_length=1, max_length=200)


class ReceiptResponse(BaseModel):
    reference: str
    payment_id: UUID
    order_id: UUID
    status: str
    amount: float
    currency: str
    created_at: datetime
