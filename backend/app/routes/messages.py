"""Authenticated order-scoped messaging endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, status

from ..auth import AuthenticatedUser, get_current_user
from ..database.connection import get_engine
from ..schemas.messages import (
    ConversationCreateRequest,
    ConversationMessagesResponse,
    ConversationResponse,
    MessageCreateRequest,
    MessageResponse,
)
from ..services.messages import (
    create_message,
    get_or_create_conversation,
    list_conversations,
    list_messages,
    mark_messages_read,
    list_notifications,
    mark_conversation_notifications_read,
    mark_notification_read,
    mark_all_notifications_read,
)
from ..services.profile_media import signed_profile_photo_url

router = APIRouter(prefix="/api/messages", tags=["messages"])


async def _conversation_response(row: dict) -> ConversationResponse:
    row = dict(row)
    row["buyer_photo_url"] = await signed_profile_photo_url(row.pop("buyer_photo_path", None))
    row["farmer_photo_url"] = await signed_profile_photo_url(row.pop("farmer_photo_path", None))
    return ConversationResponse(**row)


@router.get("/conversations", response_model=list[ConversationResponse])
async def get_conversations(user: AuthenticatedUser = Depends(get_current_user)) -> list[ConversationResponse]:
    with get_engine().connect() as connection:
        rows = list_conversations(connection, user)
    return [await _conversation_response(row) for row in rows]


@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_200_OK)
async def create_conversation(payload: ConversationCreateRequest, user: AuthenticatedUser = Depends(get_current_user)) -> ConversationResponse:
    with get_engine().begin() as connection:
        row = get_or_create_conversation(connection, user, payload.order_id, payload.listing_id)
    return await _conversation_response(row)


@router.get("/conversations/{conversation_id}/messages", response_model=ConversationMessagesResponse)
async def get_messages(conversation_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> ConversationMessagesResponse:
    with get_engine().connect() as connection:
        conversation, messages = list_messages(connection, conversation_id, user)
    return ConversationMessagesResponse(
        conversation=await _conversation_response(conversation),
        messages=[MessageResponse(**message) for message in messages],
    )


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def post_message(conversation_id: UUID, payload: MessageCreateRequest, user: AuthenticatedUser = Depends(get_current_user)) -> MessageResponse:
    with get_engine().begin() as connection:
        return MessageResponse(**create_message(connection, conversation_id, user, payload.content))


@router.patch("/messages/{message_id}/read", response_model=MessageResponse)
async def read_message(message_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> MessageResponse:
    with get_engine().begin() as connection:
        return MessageResponse(**mark_messages_read(connection, message_id, user))


@router.get("/notifications")
async def get_notifications(user: AuthenticatedUser = Depends(get_current_user)):
    with get_engine().connect() as connection:
        return list_notifications(connection, user)


@router.patch("/notifications/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def read_conversation_notifications(conversation_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> None:
    with get_engine().begin() as connection:
        mark_conversation_notifications_read(connection, conversation_id, user)


@router.patch("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def read_single_notification(notification_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> None:
    with get_engine().begin() as connection:
        mark_notification_read(connection, notification_id, user)


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def read_all_user_notifications(user: AuthenticatedUser = Depends(get_current_user)) -> None:
    with get_engine().begin() as connection:
        mark_all_notifications_read(connection, user)

