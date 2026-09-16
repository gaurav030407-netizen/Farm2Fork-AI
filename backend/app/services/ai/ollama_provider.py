"""Local Ollama fallback provider for Farm2Fork backend."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ...config import settings
from .gemini_provider import ProviderResponse

logger = logging.getLogger(__name__)


class OllamaError(Exception):
    """Raised when Ollama fallback fails."""

    def __init__(self, code: str, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class OllamaProvider:
    """Backend provider calling a locally running Ollama instance."""

    def __init__(self) -> None:
        self.base_url = settings.ollama_base_url.rstrip("/")

    async def is_available(self) -> bool:
        """Perform a fast pre-flight check to see if Ollama is running locally."""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(2.0, connect=1.5)) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except Exception:
            return False

    async def generate(
        self,
        messages: list[dict[str, str]],
        system_instruction: str | None = None,
    ) -> ProviderResponse:
        """Generate response from local Ollama model."""
        ollama_messages: list[dict[str, str]] = []

        if system_instruction:
            ollama_messages.append({"role": "system", "content": system_instruction})

        for msg in messages:
            role = "user" if msg.get("role") in {"user", "human"} else "assistant"
            text = (msg.get("content") or "").strip()
            if text:
                ollama_messages.append({"role": role, "content": text})

        if not ollama_messages:
            raise OllamaError("INVALID_PROMPT", "At least one message is required.")

        payload: dict[str, Any] = {
            "model": settings.ollama_model,
            "messages": ollama_messages,
            "stream": False,
            "options": {
                "temperature": 0.2,
                "num_predict": settings.ai_max_output_tokens,
            },
        }

        url = f"{self.base_url}/api/chat"
        timeout = httpx.Timeout(
            timeout=float(settings.ai_timeout_seconds),
            connect=min(4.0, float(settings.ai_timeout_seconds)),
        )

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(url, json=payload)
        except httpx.TimeoutException as err:
            logger.warning("Ollama request timed out after %ss", settings.ai_timeout_seconds)
            raise OllamaError("TIMEOUT", "Local Ollama request timed out.") from err
        except httpx.RequestError as err:
            logger.warning("Ollama connection error: %s", err)
            raise OllamaError("UNAVAILABLE", f"Ollama is unreachable at {self.base_url}.") from err

        if response.status_code == 404:
            raise OllamaError("MODEL_NOT_FOUND", f"Model '{settings.ollama_model}' not found in local Ollama.", 404)

        if not response.is_success:
            raise OllamaError("PROVIDER_ERROR", f"Ollama returned HTTP {response.status_code}.", response.status_code)

        data = response.json()
        message_obj = data.get("message") or {}
        output_text = (message_obj.get("content") or "").strip()

        prompt_eval_count = int(data.get("prompt_eval_count") or 0)
        eval_count = int(data.get("eval_count") or 0)

        return ProviderResponse(
            content=output_text,
            provider="ollama",
            is_fallback=True,
            prompt_tokens=prompt_eval_count,
            completion_tokens=eval_count,
        )
