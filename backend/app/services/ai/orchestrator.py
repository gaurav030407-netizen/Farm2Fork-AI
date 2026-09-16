"""Central AI Orchestrator coordinating Gemini, Ollama fallback, rate limits, and memory."""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import logging
import time
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import text

from ...config import settings
from ...database.connection import get_engine
from .domain_prompts import build_system_instruction
from .gemini_provider import GeminiError, GeminiProvider, ProviderResponse
from .ollama_provider import OllamaError, OllamaProvider
from .price_engine import PriceAnalysisResult

logger = logging.getLogger(__name__)


class SlidingWindowRateLimiter:
    """Sliding-window in-memory rate limiter per IP or User ID."""

    def __init__(self, max_requests: int = 30, window_seconds: int = 60) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.clients: dict[str, deque[float]] = {}

    def is_allowed(self, client_id: str) -> bool:
        now = time.monotonic()
        if client_id not in self.clients:
            self.clients[client_id] = deque()

        queue = self.clients[client_id]
        # Evict timestamps outside the window
        while queue and (now - queue[0]) > self.window_seconds:
            queue.popleft()

        if len(queue) >= self.max_requests:
            return False

        queue.append(now)
        return True


class AiOrchestrator:
    """Orchestrates AI requests across Gemini, Ollama fallback, and domain context."""

    def __init__(self) -> None:
        self.gemini = GeminiProvider()
        self.ollama = OllamaProvider()
        self.rate_limiter = SlidingWindowRateLimiter(
            max_requests=settings.ai_max_requests_per_minute,
            window_seconds=60,
        )
        self.in_memory_events: deque[dict[str, Any]] = deque(maxlen=50)

    def log_provider_event(
        self,
        event_type: str,
        primary: str,
        fallback: str | None,
        reason: str,
    ) -> None:
        """Record a provider switch or failure event to DB and memory."""
        event = {
            "event_type": event_type,
            "primary_provider": primary,
            "fallback_provider": fallback,
            "reason": reason,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self.in_memory_events.append(event)

        try:
            with get_engine().begin() as conn:
                conn.execute(
                    text("""
                        INSERT INTO public.ai_provider_events (event_type, primary_provider, fallback_provider, reason)
                        VALUES (:event_type, :primary_provider, :fallback_provider, :reason)
                    """),
                    {
                        "event_type": event_type,
                        "primary_provider": primary,
                        "fallback_provider": fallback,
                        "reason": reason,
                    },
                )
        except Exception as err:
            logger.debug("Skipped DB insert for ai_provider_events: %s", err)

    def record_usage(
        self,
        user_id: UUID | None,
        provider: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        request_type: str,
        success: bool,
        latency_ms: int,
        error_code: str | None = None,
    ) -> None:
        """Record usage and audit statistics."""
        try:
            with get_engine().begin() as conn:
                conn.execute(
                    text("""
                        INSERT INTO public.ai_usage
                            (user_id, provider, model, prompt_tokens, completion_tokens, request_type, success, error_code, latency_ms)
                        VALUES
                            (:user_id, :provider, :model, :prompt_tokens, :completion_tokens, :request_type, :success, :error_code, :latency_ms)
                    """),
                    {
                        "user_id": user_id,
                        "provider": provider,
                        "model": model,
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "request_type": request_type,
                        "success": success,
                        "error_code": error_code,
                        "latency_ms": latency_ms,
                    },
                )
        except Exception as err:
            logger.debug("Skipped DB insert for ai_usage: %s", err)

    async def execute_with_fallback(
        self,
        messages: list[dict[str, str]],
        system_instruction: str,
        user_id: UUID | None = None,
        request_type: str = "chat",
    ) -> ProviderResponse:
        """Execute request via primary provider (Gemini) with automatic fallback to Ollama."""
        start_time = time.monotonic()
        primary = settings.ai_provider

        # Attempt Primary (Gemini by default)
        if primary == "gemini":
            try:
                response = await self.gemini.generate(messages, system_instruction)
                latency_ms = int((time.monotonic() - start_time) * 1000)
                self.record_usage(
                    user_id=user_id,
                    provider="gemini",
                    model=settings.gemini_model,
                    prompt_tokens=response.prompt_tokens,
                    completion_tokens=response.completion_tokens,
                    request_type=request_type,
                    success=True,
                    latency_ms=latency_ms,
                )
                return response
            except GeminiError as g_err:
                logger.warning("Primary provider Gemini failed (%s): %s. Attempting Ollama fallback.", g_err.code, g_err.message)
                self.log_provider_event("fallback_triggered", "gemini", "ollama", f"{g_err.code}: {g_err.message}")

        # If primary was explicitly set to ollama, try Ollama directly first
        elif primary == "ollama":
            try:
                response = await self.ollama.generate(messages, system_instruction)
                latency_ms = int((time.monotonic() - start_time) * 1000)
                self.record_usage(
                    user_id=user_id,
                    provider="ollama",
                    model=settings.ollama_model,
                    prompt_tokens=response.prompt_tokens,
                    completion_tokens=response.completion_tokens,
                    request_type=request_type,
                    success=True,
                    latency_ms=latency_ms,
                )
                return response
            except OllamaError as o_err:
                logger.warning("Configured Ollama provider failed: %s. Attempting Gemini if configured.", o_err.message)
                if self.gemini.is_configured():
                    try:
                        return await self.gemini.generate(messages, system_instruction)
                    except GeminiError:
                        pass

        # Fallback to local Ollama
        ollama_ready = await self.ollama.is_available()
        if ollama_ready:
            try:
                response = await self.ollama.generate(messages, system_instruction)
                latency_ms = int((time.monotonic() - start_time) * 1000)
                self.record_usage(
                    user_id=user_id,
                    provider="ollama",
                    model=settings.ollama_model,
                    prompt_tokens=response.prompt_tokens,
                    completion_tokens=response.completion_tokens,
                    request_type=request_type,
                    success=True,
                    latency_ms=latency_ms,
                )
                return response
            except OllamaError as o_err:
                logger.warning("Ollama fallback also failed: %s", o_err.message)
                self.log_provider_event("provider_error", "ollama", None, o_err.message)

        # Both providers unavailable
        self.log_provider_event("all_providers_failed", primary, "ollama", "Both Gemini and Ollama are unavailable.")
        latency_ms = int((time.monotonic() - start_time) * 1000)
        self.record_usage(
            user_id=user_id,
            provider="none",
            model="none",
            prompt_tokens=0,
            completion_tokens=0,
            request_type=request_type,
            success=False,
            latency_ms=latency_ms,
            error_code="AI_UNAVAILABLE",
        )

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI assistance is temporarily unavailable.",
        )

    async def chat(
        self,
        user_message: str,
        conversation_id: UUID | None = None,
        role: str | None = None,
        page_context: str | None = None,
        user_id: UUID | None = None,
        client_ip: str = "127.0.0.1",
    ) -> dict[str, Any]:
        """Handle a website-wide assistant message."""
        # Rate limit enforcement
        client_key = str(user_id) if user_id else client_ip
        if not self.rate_limiter.is_allowed(client_key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many AI requests. Please wait a moment before sending another question.",
            )

        cid = conversation_id or uuid4()

        # Load recent conversation history (bounded to last 10 messages)
        history: list[dict[str, str]] = []
        try:
            with get_engine().connect() as conn:
                rows = conn.execute(
                    text("""
                        SELECT sender_role, content
                        FROM public.ai_messages
                        WHERE conversation_id = :cid
                        ORDER BY created_at ASC
                        LIMIT 10
                    """),
                    {"cid": cid},
                ).mappings().all()
                for r in rows:
                    history.append({"role": r["sender_role"], "content": r["content"]})
        except Exception as err:
            logger.debug("Could not read message history from DB: %s", err)

        history.append({"role": "user", "content": user_message})

        system_instruction = build_system_instruction(role=role, page_context=page_context)

        provider_resp = await self.execute_with_fallback(
            messages=history,
            system_instruction=system_instruction,
            user_id=user_id,
            request_type="chat",
        )

        # Save to DB if tables exist
        try:
            with get_engine().begin() as conn:
                conn.execute(
                    text("""
                        INSERT INTO public.ai_conversations (id, user_id, role, page_context, updated_at)
                        VALUES (:id, :user_id, :role, :page_context, now())
                        ON CONFLICT (id) DO UPDATE SET updated_at = now()
                    """),
                    {"id": cid, "user_id": user_id, "role": (role or "GUEST").upper(), "page_context": page_context},
                )
                conn.execute(
                    text("""
                        INSERT INTO public.ai_messages (conversation_id, sender_role, content)
                        VALUES (:cid, 'user', :content)
                    """),
                    {"cid": cid, "content": user_message},
                )
                conn.execute(
                    text("""
                        INSERT INTO public.ai_messages (conversation_id, sender_role, content, provider, is_fallback)
                        VALUES (:cid, 'assistant', :content, :provider, :is_fallback)
                    """),
                    {
                        "cid": cid,
                        "content": provider_resp.content,
                        "provider": provider_resp.provider,
                        "is_fallback": provider_resp.is_fallback,
                    },
                )
        except Exception as err:
            logger.debug("Could not persist conversation to DB: %s", err)

        # Build dynamic context-aware suggestions
        suggestions = self._build_suggestions(role, page_context)

        return {
            "conversation_id": str(cid),
            "reply": provider_resp.content,
            "provider": provider_resp.provider,
            "is_fallback": provider_resp.is_fallback,
            "suggestions": suggestions,
        }

    async def explain_price_analysis(
        self,
        analysis: PriceAnalysisResult,
        user_id: UUID | None = None,
    ) -> str:
        """Generate a concise, faithful explanation of deterministic price figures."""
        if not analysis.has_sufficient_data:
            return analysis.ai_interpretation

        prompt = f"""You are the Farm2Fork Market Price Assistant.
Explain the following calculated market numbers to the farmer/buyer in a warm, concise, and helpful tone (2-3 sentences).

DETERMINISTIC NUMBERS:
- Crop: {analysis.crop}
- Variety: {analysis.variety}
- Mandi / Market: {analysis.selected_market} ({analysis.district or ''}, {analysis.state or ''})
- Latest Modal Price: ₹{analysis.latest_modal:,.0f} per quintal
- Recent Price Range: ₹{analysis.recent_range_min:,.0f} – ₹{analysis.recent_range_max:,.0f} (Median: ₹{analysis.recent_median:,.0f})
- Observed Trend: {analysis.trend}
- Data Coverage: {analysis.data_coverage_from} to {analysis.data_coverage_to} ({analysis.observations_count} official arrival records)
- Confidence Level: {analysis.confidence}
{f"- Listed Asking Price: ₹{analysis.asking_price:,.0f} per quintal ({analysis.difference_summary})" if analysis.asking_price else ""}

RULES:
1. Do NOT recalculate or invent any numbers. Use only the exact figures provided above.
2. Clearly explain what the modal reference and trend mean for the user.
3. If an asking price is provided, comment objectively on how it compares to the modal reference.
4. Conclude with the required notice: "{analysis.disclaimer}"
"""
        messages = [{"role": "user", "content": prompt}]
        try:
            resp = await self.execute_with_fallback(
                messages=messages,
                system_instruction="You explain verified agricultural numbers accurately without hallucinating.",
                user_id=user_id,
                request_type="price_analysis",
            )
            return resp.content
        except Exception as err:
            logger.warning("LLM explanation failed; falling back to deterministic template: %s", err)
            return analysis.ai_interpretation

    def _build_suggestions(self, role: str | None, page_context: str | None) -> list[str]:
        """Generate contextual follow-up chips."""
        r = (role or "GUEST").upper()
        p = (page_context or "").lower()

        if r == "FARMER":
            if "sell" in p:
                return ["What does modal price mean?", "How do I upload crop photos?", "What is the difference between Crop and Variety?"]
            return ["How do I sell a crop?", "How do I check market mandi prices?", "How does driver pickup verification work?"]
        if r in {"BUYER", "BULK_BUYER"}:
            return ["How do I place a bulk order?", "How do I compare two mandis?", "Where can I view recent modal references?"]
        if r == "CONSUMER":
            return ["How do I buy 2 kg tomatoes?", "How do I track my order?", "How does payment work?"]
        if r == "DRIVER":
            return ["How do I accept a pickup?", "How does pickup verification work?", "Where can I see my earnings?"]
        if r == "ADMIN":
            return ["How many active listings exist?", "Show market data sync status", "How many pending driver approvals exist?"]

        return ["What is Farm2Fork?", "How do I register as a Farmer?", "How do I buy fresh produce?"]

    async def get_status(self) -> dict[str, Any]:
        """Get operational status of the AI subsystem without exposing secrets."""
        ollama_ready = await self.ollama.is_available()
        return {
            "configured_provider": settings.ai_provider,
            "gemini_configured": self.gemini.is_configured(),
            "gemini_model": settings.gemini_model,
            "ollama_available": ollama_ready,
            "ollama_model": settings.ollama_model,
            "fallback_available": ollama_ready,
            "rate_limit_per_minute": settings.ai_max_requests_per_minute,
            "timeout_seconds": settings.ai_timeout_seconds,
            "recent_events": list(self.in_memory_events)[-5:],
        }


ai_orchestrator = AiOrchestrator()
