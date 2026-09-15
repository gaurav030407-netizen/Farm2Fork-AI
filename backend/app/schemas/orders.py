"""Request and response contracts for PostgreSQL-backed orders."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


OrderStatus = Literal[
    "PENDING",
    "ACCEPTED",
    "REJECTED",
    "PROCESSING",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
]


class OrderCreateRequest(BaseModel):
    crop_listing_id: UUID
    quantity: Decimal = Field(gt=0)
    delivery_location: str = Field(min_length=1, max_length=240)

    @field_validator("delivery_location")
    @classmethod
    def validate_delivery_location(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Delivery location cannot be empty.")
        return value


class OrderStatusUpdateRequest(BaseModel):
    status: OrderStatus


class OrderItemResponse(BaseModel):
    id: UUID
    crop_listing_id: UUID
    crop_name: str
    variety: str | None
    image_url: str | None
    quantity: float
    unit: str
    price: float
    subtotal: float


class OrderResponse(BaseModel):
    id: UUID
    status: OrderStatus
    payment_status: str = "CREATED"
    total_amount: float
    delivery_location: str
    created_at: datetime
    updated_at: datetime
    buyer_name: str | None = None
    farmer_name: str | None = None
    items: list[OrderItemResponse]