"""Contracts for authenticated buyer/farmer messaging."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class ConversationCreateRequest(BaseModel):
    order_id: UUID | None = None
    listing_id: UUID | None = None

    @model_validator(mode="after")
    def require_context(self) -> "ConversationCreateRequest":
        if self.order_id is None and self.listing_id is None:
            raise ValueError("An order or listing is required.")
        if self.order_id is not None and self.listing_id is not None:
            raise ValueError("Provide an order or listing, not both.")
        return self


class MessageCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        content = value.strip()
        if not content:
            raise ValueError("Message cannot be empty.")
        return content


class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_id: UUID
    receiver_id: UUID
    content: str
    is_read: bool
    created_at: datetime
    read_at: datetime | None = None


class ConversationResponse(BaseModel):
    conversation_id: UUID
    order_id: UUID | None = None
    crop_listing_id: UUID | None = None
    buyer_name: str
    farmer_name: str
    buyer_photo_url: str | None = None
    farmer_photo_url: str | None = None
    crop_name: str | None = None
    latest_message: str | None = None
    latest_message_at: datetime | None = None
    unread_count: int = 0


class ConversationMessagesResponse(BaseModel):
    conversation: ConversationResponse
    messages: list[MessageResponse]


class NotificationResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    message_id: UUID
    actor_id: UUID
    type: str
    is_read: bool
    created_at: datetime
    read_at: datetime | None = None
