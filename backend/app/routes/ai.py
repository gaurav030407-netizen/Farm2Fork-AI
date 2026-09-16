"""FastAPI routes for Farm2Fork AI Assistant and Market Price Decision Support."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..auth import AuthenticatedUser, get_current_user, get_optional_current_user
from ..database.connection import get_engine
from ..services.ai.orchestrator import ai_orchestrator
from ..services.ai.price_engine import price_decision_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai-assistant"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: UUID | None = None
    page_context: str | None = Field(default=None, max_length=255)
    role: str | None = Field(default=None, max_length=32)


class PriceAssistantRequest(BaseModel):
    crop: str = Field(min_length=1, max_length=120)
    variety: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    market: str | None = Field(default=None, max_length=160)
    asking_price: float | None = Field(default=None, ge=0)
    period: str = Field(default="2m", pattern=r"^(2m|6m|1y|2y|5y)$")


@router.post("/chat")
async def chat_with_assistant(
    payload: ChatRequest,
    request: Request,
    user: AuthenticatedUser | None = Depends(get_optional_current_user),
) -> dict[str, Any]:
    """Chat with the website-wide Farm2Fork AI assistant."""
    # Determine effective role: authenticated user's role takes precedence
    effective_role = user.role if user else (payload.role or "GUEST")
    user_id = user.id if user else None
    client_ip = request.client.host if request.client else "127.0.0.1"

    return await ai_orchestrator.chat(
        user_message=payload.message.strip(),
        conversation_id=payload.conversation_id,
        role=effective_role,
        page_context=payload.page_context,
        user_id=user_id,
        client_ip=client_ip,
    )


@router.post("/price-assistant")
async def agricultural_price_decision_support(
    payload: PriceAssistantRequest,
    user: AuthenticatedUser | None = Depends(get_optional_current_user),
) -> dict[str, Any]:
    """Run deterministic market price analysis and return AI explanation with confidence."""
    user_id = user.id if user else None

    # Step 1: Run deterministic statistical calculations on real market records
    analysis = price_decision_engine.calculate(
        crop=payload.crop.strip(),
        variety=payload.variety.strip() if payload.variety else None,
        state=payload.state.strip() if payload.state else None,
        district=payload.district.strip() if payload.district else None,
        market=payload.market.strip() if payload.market else None,
        asking_price=payload.asking_price,
        period=payload.period,
    )

    # Step 2: AI explains the calculated numbers without hallucinating or modifying them
    if analysis.has_sufficient_data:
        explanation = await ai_orchestrator.explain_price_analysis(analysis, user_id=user_id)
        analysis.ai_interpretation = explanation

    return analysis.to_dict()


@router.get("/status")
async def get_ai_status(
    user: AuthenticatedUser | None = Depends(get_optional_current_user),
) -> dict[str, Any]:
    """Return backend AI operational status."""
    status_info = await ai_orchestrator.get_status()

    # Normal users get operational readiness; ADMIN users also get recent event diagnostic log
    is_admin = user is not None and user.role == "ADMIN"
    if not is_admin:
        status_info.pop("recent_events", None)

    return status_info


@router.get("/conversations")
async def list_conversations(
    user: AuthenticatedUser = Depends(get_current_user),
    limit: int = Query(default=10, ge=1, le=50),
) -> list[dict[str, Any]]:
    """List authenticated user's recent AI conversations."""
    try:
        with get_engine().connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT id, title, role, page_context, created_at, updated_at
                    FROM public.ai_conversations
                    WHERE user_id = :user_id
                    ORDER BY updated_at DESC
                    LIMIT :limit
                """),
                {"user_id": user.id, "limit": limit},
            ).mappings().all()

        return [
            {
                "id": str(r["id"]),
                "title": r["title"] or "Farm2Fork Assistance",
                "role": r["role"],
                "page_context": r["page_context"],
                "created_at": str(r["created_at"]),
                "updated_at": str(r["updated_at"]),
            }
            for r in rows
        ]
    except Exception as err:
        logger.warning("Error fetching conversations: %s", err)
        return []


@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Retrieve message history for a specific conversation."""
    try:
        with get_engine().connect() as conn:
            # Verify ownership
            owner_id = conn.execute(
                text("SELECT user_id FROM public.ai_conversations WHERE id = :id"),
                {"id": conversation_id},
            ).scalar_one_or_none()

            if owner_id and owner_id != user.id and user.role != "ADMIN":
                raise HTTPException(status_code=403, detail="Access denied.")

            rows = conn.execute(
                text("""
                    SELECT id, sender_role, content, provider, is_fallback, created_at
                    FROM public.ai_messages
                    WHERE conversation_id = :cid
                    ORDER BY created_at ASC
                    LIMIT 20
                """),
                {"cid": conversation_id},
            ).mappings().all()

        return [
            {
                "id": str(r["id"]),
                "sender_role": r["sender_role"],
                "content": r["content"],
                "provider": r["provider"],
                "is_fallback": bool(r["is_fallback"]),
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ]
    except HTTPException:
        raise
    except Exception as err:
        logger.warning("Error fetching conversation messages: %s", err)
        return []


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, str]:
    """Delete a conversation history."""
    try:
        with get_engine().begin() as conn:
            conn.execute(
                text("DELETE FROM public.ai_conversations WHERE id = :id AND (user_id = :uid OR :is_admin = true)"),
                {"id": conversation_id, "uid": user.id, "is_admin": user.role == "ADMIN"},
            )
        return {"status": "deleted"}
    except Exception as err:
        logger.warning("Error deleting conversation: %s", err)
        return {"status": "error"}
