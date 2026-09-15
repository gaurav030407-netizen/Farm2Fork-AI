"""Authenticated buyer/farmer messaging backed by PostgreSQL."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import text

from ..auth import AuthenticatedUser
from ..database.connection import get_engine

logger = logging.getLogger(__name__)


def _participant_ids(connection, user: AuthenticatedUser, order_id: UUID) -> tuple[UUID, UUID, UUID, UUID | None]:
    order = connection.execute(
        text(
            """
            SELECT o.buyer_id, o.farmer_id,
                   (SELECT oi.crop_listing_id FROM public.order_items oi
                    WHERE oi.order_id = o.id ORDER BY oi.created_at LIMIT 1) AS crop_listing_id
            FROM public.orders o
            WHERE o.id = :order_id
            """
        ),
        {"order_id": order_id},
    ).mappings().one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    buyer_profile = connection.execute(
        text("SELECT profile_id FROM public.buyers WHERE id = :id"), {"id": order["buyer_id"]}
    ).scalar_one()
    farmer_profile = connection.execute(
        text("SELECT profile_id FROM public.farmers WHERE id = :id"), {"id": order["farmer_id"]}
    ).scalar_one()
    if str(user.id) not in {str(buyer_profile), str(farmer_profile)}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this order.")
    return order["buyer_id"], order["farmer_id"], order_id, order["crop_listing_id"]


def _conversation_row(connection, conversation_id: UUID, user: AuthenticatedUser):
    row = connection.execute(
        text(
            """
                 SELECT c.id AS conversation_id, c.order_id, c.crop_listing_id,
                     bp.name AS buyer_name, fp.name AS farmer_name,
                     bp.profile_photo_path AS buyer_photo_path, fp.profile_photo_path AS farmer_photo_path, cl.crop_name,
                   latest.content AS latest_message, latest.created_at AS latest_message_at,
                   (SELECT count(*) FROM public.messages unread
                    WHERE unread.conversation_id = c.id
                      AND unread.receiver_id = :profile_id AND unread.is_read = false) AS unread_count
            FROM public.conversations c
            JOIN public.buyers b ON b.id = c.buyer_id
            JOIN public.farmers f ON f.id = c.farmer_id
            JOIN public.profiles bp ON bp.id = b.profile_id
            JOIN public.profiles fp ON fp.id = f.profile_id
            LEFT JOIN public.crop_listings cl ON cl.id = c.crop_listing_id
            LEFT JOIN LATERAL (
                SELECT m.content, m.created_at FROM public.messages m
                WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
            ) latest ON true
            WHERE c.id = :conversation_id
              AND (:profile_id = b.profile_id OR :profile_id = f.profile_id)
            """
        ),
        {"conversation_id": conversation_id, "profile_id": user.id},
    ).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return dict(row)


def _conversation_response(row: dict) -> dict:
    return {
        "conversation_id": row["conversation_id"],
        "order_id": row["order_id"],
        "crop_listing_id": row.get("crop_listing_id"),
        "buyer_name": row["buyer_name"],
        "farmer_name": row["farmer_name"],
        "crop_name": row.get("crop_name"),
        "latest_message": row.get("latest_message"),
        "latest_message_at": row.get("latest_message_at"),
        "unread_count": int(row.get("unread_count") or 0),
    }


def _listing_participants(connection, user: AuthenticatedUser, listing_id: UUID) -> tuple[UUID, UUID, UUID]:
    if user.role not in {"BUYER", "CONSUMER"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only buyers can start a farmer conversation.")
    listing = connection.execute(
        text("SELECT farmer_id FROM public.crop_listings WHERE id = :listing_id AND status = 'ACTIVE'"),
        {"listing_id": listing_id},
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crop listing not found.")
    buyer_id = connection.execute(
        text("SELECT id FROM public.buyers WHERE profile_id = :profile_id"), {"profile_id": user.id}
    ).scalar_one_or_none()
    if buyer_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Buyer profile not found.")
    return buyer_id, listing, listing_id


def get_or_create_conversation(connection, user: AuthenticatedUser, order_id: UUID | None = None, listing_id: UUID | None = None) -> dict:
    logger.info(
        "MESSAGE_CONVERSATION_OPEN user_id=%s role=%s listing_id=%s order_id=%s",
        user.id,
        user.role,
        listing_id,
        order_id,
    )
    if listing_id is not None:
        buyer_id, farmer_id, crop_listing_id = _listing_participants(connection, user, listing_id)
        existing = connection.execute(
            text("SELECT id FROM public.conversations WHERE buyer_id = :buyer_id AND farmer_id = :farmer_id"),
            {"buyer_id": buyer_id, "farmer_id": farmer_id},
        ).scalar_one_or_none()
        if existing is None:
            existing = connection.execute(
                text(
                    """
                    INSERT INTO public.conversations (buyer_id, farmer_id, crop_listing_id)
                    VALUES (:buyer_id, :farmer_id, :crop_listing_id)
                    ON CONFLICT (buyer_id, farmer_id) DO UPDATE SET updated_at = now()
                    RETURNING id
                    """
                ),
                {"buyer_id": buyer_id, "farmer_id": farmer_id, "crop_listing_id": crop_listing_id},
            ).scalar_one()
            logger.info(
                "MESSAGE_CONVERSATION_CREATE conversation_id=%s buyer_id=%s farmer_id=%s listing_id=%s",
                existing,
                buyer_id,
                farmer_id,
                listing_id,
            )
        return _conversation_row(connection, existing, user)

    if order_id is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="An order or listing is required.")
    buyer_id, farmer_id, _, crop_listing_id = _participant_ids(connection, user, order_id)
    connection.execute(
        text(
            """
            INSERT INTO public.conversations (buyer_id, farmer_id, order_id, crop_listing_id)
            VALUES (:buyer_id, :farmer_id, :order_id, :crop_listing_id)
            ON CONFLICT (buyer_id, farmer_id) DO UPDATE SET updated_at = now()
            """
        ),
        {"buyer_id": buyer_id, "farmer_id": farmer_id, "order_id": order_id, "crop_listing_id": crop_listing_id},
    )
    row = connection.execute(text("SELECT id FROM public.conversations WHERE buyer_id = :buyer_id AND farmer_id = :farmer_id"), {"buyer_id": buyer_id, "farmer_id": farmer_id}).scalar_one()
    return _conversation_row(connection, row, user)


def list_conversations(connection, user: AuthenticatedUser) -> list[dict]:
    profile_id = user.id
    rows = connection.execute(
        text(
            """
                 SELECT c.id AS conversation_id, c.order_id, c.crop_listing_id,
                     bp.name AS buyer_name, fp.name AS farmer_name,
                     bp.profile_photo_path AS buyer_photo_path, fp.profile_photo_path AS farmer_photo_path, cl.crop_name,
                   latest.content AS latest_message, latest.created_at AS latest_message_at,
                   (SELECT count(*) FROM public.messages unread
                    WHERE unread.conversation_id = c.id
                      AND unread.receiver_id = :profile_id AND unread.is_read = false) AS unread_count
            FROM public.conversations c
            JOIN public.buyers b ON b.id = c.buyer_id
            JOIN public.farmers f ON f.id = c.farmer_id
            JOIN public.profiles bp ON bp.id = b.profile_id
            JOIN public.profiles fp ON fp.id = f.profile_id
            LEFT JOIN public.crop_listings cl ON cl.id = c.crop_listing_id
            LEFT JOIN LATERAL (
                SELECT m.content, m.created_at FROM public.messages m
                WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
            ) latest ON true
            WHERE b.profile_id = :profile_id OR f.profile_id = :profile_id
            ORDER BY COALESCE(latest.created_at, c.updated_at) DESC
            """
        ),
        {"profile_id": profile_id},
    ).mappings()
    return [dict(row) for row in rows]


def list_messages(connection, conversation_id: UUID, user: AuthenticatedUser) -> tuple[dict, list[dict]]:
    conversation = _conversation_row(connection, conversation_id, user)
    messages = connection.execute(
        text(
            """
            SELECT id, conversation_id, sender_id, receiver_id, content, is_read, created_at, read_at
            FROM public.messages
            WHERE conversation_id = :conversation_id
            ORDER BY created_at ASC
            """
        ),
        {"conversation_id": conversation_id},
    ).mappings()
    return conversation, [dict(row) for row in messages]


def create_message(connection, conversation_id: UUID, user: AuthenticatedUser, content: str) -> dict:
    conversation = connection.execute(
        text(
            """
            SELECT c.id, c.order_id, c.crop_listing_id, b.profile_id AS buyer_profile_id,
                   f.profile_id AS farmer_profile_id
            FROM public.conversations c
            JOIN public.buyers b ON b.id = c.buyer_id
            JOIN public.farmers f ON f.id = c.farmer_id
            WHERE c.id = :conversation_id
            FOR UPDATE
            """
        ),
        {"conversation_id": conversation_id},
    ).mappings().one_or_none()
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    if str(user.id) == str(conversation["buyer_profile_id"]):
        receiver_id = conversation["farmer_profile_id"]
    elif str(user.id) == str(conversation["farmer_profile_id"]):
        receiver_id = conversation["buyer_profile_id"]
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this conversation.")
    row = connection.execute(
        text(
            """
            INSERT INTO public.messages (conversation_id, sender_id, receiver_id, order_id, crop_listing_id, content)
            VALUES (:conversation_id, :sender_id, :receiver_id, :order_id, :crop_listing_id, :content)
            RETURNING id, conversation_id, sender_id, receiver_id, content, is_read, created_at, read_at
            """
        ),
        {"conversation_id": conversation_id, "sender_id": user.id, "receiver_id": receiver_id,
         "order_id": conversation["order_id"], "crop_listing_id": conversation["crop_listing_id"], "content": content.strip()},
    ).mappings().one()
    connection.execute(text("UPDATE public.conversations SET updated_at = now() WHERE id = :id"), {"id": conversation_id})
    connection.execute(
        text(
            """
            INSERT INTO public.notifications (recipient_id, actor_id, conversation_id, message_id)
            VALUES (:recipient_id, :actor_id, :conversation_id, :message_id)
            ON CONFLICT (message_id) DO NOTHING
            """
        ),
        {"recipient_id": receiver_id, "actor_id": user.id, "conversation_id": conversation_id, "message_id": row["id"]},
    )
    logger.info(
        "MESSAGE_SEND message_id=%s conversation_id=%s sender_id=%s receiver_id=%s",
        row["id"],
        conversation_id,
        user.id,
        receiver_id,
    )
    logger.info(
        "MESSAGE_NOTIFICATION_CREATE message_id=%s conversation_id=%s recipient_id=%s",
        row["id"],
        conversation_id,
        receiver_id,
    )
    return dict(row)


def mark_messages_read(connection, message_id: UUID, user: AuthenticatedUser) -> dict:
    row = connection.execute(
        text(
            """
            UPDATE public.messages
            SET is_read = true, read_at = COALESCE(read_at, now())
            WHERE id = :message_id AND receiver_id = :profile_id
            RETURNING id, conversation_id, sender_id, receiver_id, content, is_read, created_at, read_at
            """
        ),
        {"message_id": message_id, "profile_id": user.id},
    ).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")
    connection.execute(text("UPDATE public.notifications SET is_read = true, read_at = COALESCE(read_at, now()) WHERE message_id = :message_id AND recipient_id = :profile_id"), {"message_id": message_id, "profile_id": user.id})
    return dict(row)


def list_notifications(connection, user: AuthenticatedUser) -> list[dict]:
    rows = connection.execute(
        text(
            """
            SELECT 
                n.id, 
                n.conversation_id, 
                n.message_id, 
                n.actor_id, 
                n.type, 
                n.is_read, 
                n.created_at, 
                n.read_at,
                p.name AS actor_name,
                p.role AS actor_role,
                m.content AS message_content,
                c.order_id,
                c.crop_listing_id
            FROM public.notifications n
            LEFT JOIN public.profiles p ON p.id = n.actor_id
            LEFT JOIN public.messages m ON m.id = n.message_id
            LEFT JOIN public.conversations c ON c.id = n.conversation_id
            WHERE n.recipient_id = :profile_id 
            ORDER BY n.created_at DESC 
            LIMIT 50
            """
        ),
        {"profile_id": user.id},
    ).mappings()
    return [dict(row) for row in rows]


def mark_conversation_notifications_read(connection, conversation_id: UUID, user: AuthenticatedUser) -> None:
    connection.execute(
        text("UPDATE public.notifications SET is_read = true, read_at = COALESCE(read_at, now()) WHERE conversation_id = :conversation_id AND recipient_id = :profile_id"),
        {"conversation_id": conversation_id, "profile_id": user.id},
    )


def mark_notification_read(connection, notification_id: UUID, user: AuthenticatedUser) -> None:
    connection.execute(
        text("UPDATE public.notifications SET is_read = true, read_at = COALESCE(read_at, now()) WHERE id = :notification_id AND recipient_id = :profile_id"),
        {"notification_id": notification_id, "profile_id": user.id},
    )


def mark_all_notifications_read(connection, user: AuthenticatedUser) -> None:
    connection.execute(
        text("UPDATE public.notifications SET is_read = true, read_at = COALESCE(read_at, now()) WHERE recipient_id = :profile_id AND is_read = false"),
        {"profile_id": user.id},
    )

