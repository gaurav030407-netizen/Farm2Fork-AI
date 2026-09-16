"""Google Gemini API provider implementation for Farm2Fork backend."""

from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Any

import httpx

from ...config import settings

logger = logging.getLogger(__name__)

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


class GeminiError(Exception):
    """Raised when Gemini provider fails or encounters an unrecoverable condition."""

    def __init__(self, code: str, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class ProviderResponse:
    """Standardized response from any AI provider."""

    content: str
    provider: str
    is_fallback: bool = False
    prompt_tokens: int = 0
    completion_tokens: int = 0


class GeminiProvider:
    """Backend provider calling the official Google Gemini REST API."""

    def __init__(self) -> None:
        self.base_url = GEMINI_API_BASE

    def is_configured(self) -> bool:
        """Check if GEMINI_API_KEY is configured in backend settings."""
        return bool(settings.gemini_api_key and settings.gemini_api_key.strip())

    async def generate(
        self,
        messages: list[dict[str, str]],
        system_instruction: str | None = None,
    ) -> ProviderResponse:
        """Generate response from Gemini model."""
        if not self.is_configured():
            raise GeminiError("API_KEY_MISSING", "Gemini API key is not configured.")

        # Build payload according to Gemini REST specification
        contents: list[dict[str, Any]] = []
        for msg in messages:
            role = "user" if msg.get("role") in {"user", "human"} else "model"
            text = (msg.get("content") or "").strip()
            if text:
                contents.append({
                    "role": role,
                    "parts": [{"text": text}],
                })

        if not contents:
            raise GeminiError("INVALID_PROMPT", "At least one message is required.")

        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": settings.ai_max_output_tokens,
            },
        }

        if system_instruction:
            payload["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        url = f"{self.base_url}/models/{settings.gemini_model}:generateContent"
        params = {"key": settings.gemini_api_key}

        timeout = httpx.Timeout(
            timeout=float(settings.ai_timeout_seconds),
            connect=min(5.0, float(settings.ai_timeout_seconds)),
        )

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    url,
                    params=params,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )
        except httpx.TimeoutException as err:
            logger.warning("Gemini request timed out after %ss", settings.ai_timeout_seconds)
            raise GeminiError("TIMEOUT", "Gemini request timed out.") from err
        except httpx.RequestError as err:
            logger.warning("Gemini network error: %s", err)
            raise GeminiError("NETWORK_ERROR", f"Gemini connection error: {err}") from err

        if response.status_code == 429:
            logger.warning("Gemini rate limit (429) encountered")
            raise GeminiError("RATE_LIMITED", "Gemini API rate limit exceeded.", 429)

        if response.status_code in {401, 403}:
            logger.warning("Gemini authentication/permission error: %s", response.status_code)
            raise GeminiError("AUTH_ERROR", "Gemini authentication failed.", response.status_code)

        if response.status_code >= 500:
            logger.warning("Gemini server error: %s %s", response.status_code, response.text[:200])
            raise GeminiError("PROVIDER_ERROR", f"Gemini server error ({response.status_code}).", response.status_code)

        if not response.is_success:
            logger.warning("Gemini error response %s: %s", response.status_code, response.text[:300])
            raise GeminiError("PROVIDER_ERROR", f"Gemini API returned HTTP {response.status_code}.", response.status_code)

        data = response.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise GeminiError("EMPTY_RESPONSE", "Gemini returned no candidates.")

        candidate = candidates[0]
        content_obj = candidate.get("content") or {}
        parts = content_obj.get("parts") or []
        output_text = "".join(part.get("text", "") for part in parts).strip()

        usage = data.get("usageMetadata") or {}
        prompt_tokens = int(usage.get("promptTokenCount") or 0)
        completion_tokens = int(usage.get("candidatesTokenCount") or 0)

        return ProviderResponse(
            content=output_text,
            provider="gemini",
            is_fallback=False,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
