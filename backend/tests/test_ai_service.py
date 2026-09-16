"""Comprehensive automated tests for Farm2Fork AI Assistant and Decision Support System."""

import os
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

# Ensure required environment variables for test imports
os.environ.setdefault("DATABASE_URL", "postgresql://user:password@localhost:5432/farm2fork")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-at-least-thirty-two-characters")

from backend.app.services.ai.domain_prompts import build_system_instruction
from backend.app.services.ai.gemini_provider import GeminiError, GeminiProvider, ProviderResponse
from backend.app.services.ai.ollama_provider import OllamaError, OllamaProvider
from backend.app.services.ai.orchestrator import AiOrchestrator, SlidingWindowRateLimiter
from backend.app.services.ai.price_engine import PriceAnalysisResult, PriceDecisionEngine
from backend.app.services.ai.tools import get_admin_operational_stats, get_user_profile_summary


# ==============================================================================
# 1. PROVIDER & FALLBACK TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_gemini_available_returns_gemini_response():
    """Test 1: Gemini succeeds and returns primary provider response."""
    orchestrator = AiOrchestrator()
    orchestrator.gemini.generate = AsyncMock(
        return_value=ProviderResponse(
            content="Hello Farmer! You can list crops under Sell a Crop.",
            provider="gemini",
            is_fallback=False,
            prompt_tokens=15,
            completion_tokens=20,
        )
    )

    resp = await orchestrator.execute_with_fallback(
        messages=[{"role": "user", "content": "How do I sell a crop?"}],
        system_instruction="Farmer system prompt",
    )

    assert resp.content == "Hello Farmer! You can list crops under Sell a Crop."
    assert resp.provider == "gemini"
    assert resp.is_fallback is False


@pytest.mark.asyncio
async def test_gemini_429_triggers_ollama_fallback():
    """Test 2: Gemini encounters 429 rate limit and falls back to Ollama."""
    orchestrator = AiOrchestrator()
    orchestrator.gemini.generate = AsyncMock(
        side_effect=GeminiError("RATE_LIMITED", "Gemini API rate limit exceeded.", 429)
    )
    orchestrator.ollama.is_available = AsyncMock(return_value=True)
    orchestrator.ollama.generate = AsyncMock(
        return_value=ProviderResponse(
            content="Ollama response: Navigate to Sell a Crop.",
            provider="ollama",
            is_fallback=True,
            prompt_tokens=10,
            completion_tokens=15,
        )
    )

    resp = await orchestrator.execute_with_fallback(
        messages=[{"role": "user", "content": "How do I list crops?"}],
        system_instruction="System prompt",
    )

    assert resp.provider == "ollama"
    assert resp.is_fallback is True
    assert "Ollama response" in resp.content


@pytest.mark.asyncio
async def test_gemini_timeout_triggers_ollama_fallback():
    """Test 3: Gemini times out and falls back to Ollama."""
    orchestrator = AiOrchestrator()
    orchestrator.gemini.generate = AsyncMock(
        side_effect=GeminiError("TIMEOUT", "Gemini request timed out.")
    )
    orchestrator.ollama.is_available = AsyncMock(return_value=True)
    orchestrator.ollama.generate = AsyncMock(
        return_value=ProviderResponse(
            content="Fallback answer from local Ollama.",
            provider="ollama",
            is_fallback=True,
        )
    )

    resp = await orchestrator.execute_with_fallback(
        messages=[{"role": "user", "content": "Hello"}],
        system_instruction="System prompt",
    )

    assert resp.provider == "ollama"
    assert resp.is_fallback is True


@pytest.mark.asyncio
async def test_gemini_key_missing_triggers_ollama_fallback():
    """Test 4: Gemini key missing immediately falls back to Ollama."""
    orchestrator = AiOrchestrator()
    orchestrator.gemini.is_configured = lambda: False
    orchestrator.gemini.generate = AsyncMock(
        side_effect=GeminiError("API_KEY_MISSING", "Gemini API key is not configured.")
    )
    orchestrator.ollama.is_available = AsyncMock(return_value=True)
    orchestrator.ollama.generate = AsyncMock(
        return_value=ProviderResponse(
            content="Local model response without Gemini API key.",
            provider="ollama",
            is_fallback=True,
        )
    )

    resp = await orchestrator.execute_with_fallback(
        messages=[{"role": "user", "content": "Test"}],
        system_instruction="System prompt",
    )

    assert resp.provider == "ollama"
    assert resp.is_fallback is True


@pytest.mark.asyncio
async def test_both_providers_unavailable_raises_503_gracefully():
    """Test 5 & 6: Both Gemini and Ollama fail -> graceful 503 error without crashing app."""
    from fastapi import HTTPException

    orchestrator = AiOrchestrator()
    orchestrator.gemini.generate = AsyncMock(
        side_effect=GeminiError("PROVIDER_ERROR", "Gemini unavailable.")
    )
    orchestrator.ollama.is_available = AsyncMock(return_value=False)

    with pytest.raises(HTTPException) as exc_info:
        await orchestrator.execute_with_fallback(
            messages=[{"role": "user", "content": "Hello"}],
            system_instruction="System prompt",
        )

    assert exc_info.value.status_code == 503
    assert "AI assistance is temporarily unavailable" in exc_info.value.detail


# ==============================================================================
# 2. ROLE-AWARE SYSTEM PROMPT TESTS
# ==============================================================================

def test_farmer_prompt_includes_farmer_workflows():
    """Test 7: Farmer receives farmer-specific guidance."""
    prompt = build_system_instruction(role="FARMER")
    assert "CURRENT USER CONTEXT (ROLE: FARMER)" in prompt
    assert "Sell a Crop" in prompt
    assert "modal price" in prompt.lower()


def test_bulk_buyer_prompt_includes_buyer_workflows():
    """Test 8: Bulk Buyer receives wholesale and mandi comparison guidance."""
    prompt = build_system_instruction(role="BULK_BUYER")
    assert "CURRENT USER CONTEXT (ROLE: BULK_BUYER)" in prompt
    assert "wholesale" in prompt.lower()
    assert "escrow" in prompt.lower()


def test_consumer_prompt_includes_consumer_workflows():
    """Test 9: Consumer receives small household purchase guidance."""
    prompt = build_system_instruction(role="CONSUMER")
    assert "CURRENT USER CONTEXT (ROLE: CONSUMER)" in prompt
    assert "2 kg tomatoes" in prompt


def test_driver_prompt_includes_driver_workflows():
    """Test 10: Driver receives pickup verification and delivery guidance."""
    prompt = build_system_instruction(role="DRIVER")
    assert "CURRENT USER CONTEXT (ROLE: DRIVER)" in prompt
    assert "pickup verification code" in prompt


def test_crop_variety_distinction_enforced_in_prompt():
    """Test: Prompt strictly enforces that Crop != Variety."""
    prompt = build_system_instruction(role="FARMER")
    assert "CROP != VARIETY" in prompt
    assert "Potato -> Varieties: Kufri Jyoti" in prompt
    assert "NEVER call a crop name" in prompt


# ==============================================================================
# 3. SECURITY & READ-ONLY GUARDRAILS
# ==============================================================================

def test_prompt_enforces_read_only_mode():
    """Test 12: Prompt strictly forbids direct modifications."""
    prompt = build_system_instruction(role="FARMER")
    assert "READ-ONLY" in prompt
    assert "CANNOT directly modify database records" in prompt


def test_user_profile_summary_sanitizes_secrets():
    """Test 17: Tool strips passwords, hashes, tokens, and OTPs."""
    mock_row = {
        "id": uuid4(),
        "email": "farmer@example.com",
        "name": "Ramesh Kumar",
        "role": "FARMER",
        "account_status": "ACTIVE",
        "state": "Uttar Pradesh",
        "district": "Kanpur",
        "email_verified": True,
        "phone_verified": True,
    }
    with patch("backend.app.services.ai.tools.get_engine") as mock_engine:
        mock_conn = mock_engine.return_value.connect.return_value.__enter__.return_value
        mock_conn.execute.return_value.mappings.return_value.one_or_none.return_value = mock_row

        summary = get_user_profile_summary(uuid4())
        assert summary["status"] == "success"
        assert "password" not in summary
        assert "otp" not in summary
        assert "token" not in summary


# ==============================================================================
# 4. DETERMINISTIC AGRICULTURAL PRICE DECISION SUPPORT TESTS
# ==============================================================================

def test_deterministic_calculations_with_sufficient_data():
    """Test 13 & 14: Engine computes exact mathematical metrics on real observations."""
    engine = PriceDecisionEngine()

    mock_records = [
        {"source_commodity": "Potato", "source_variety": "Kufri Jyoti", "market": "Kanpur APMC", "modal_price": 1200, "arrival_date": "2026-08-01", "unit": "₹ / quintal"},
        {"source_commodity": "Potato", "source_variety": "Kufri Jyoti", "market": "Kanpur APMC", "modal_price": 1250, "arrival_date": "2026-08-10", "unit": "₹ / quintal"},
        {"source_commodity": "Potato", "source_variety": "Kufri Jyoti", "market": "Kanpur APMC", "modal_price": 1300, "arrival_date": "2026-08-20", "unit": "₹ / quintal"},
        {"source_commodity": "Potato", "source_variety": "Kufri Jyoti", "market": "Kanpur APMC", "modal_price": 1350, "arrival_date": "2026-08-30", "unit": "₹ / quintal"},
    ]

    with patch.object(engine, "fetch_records", return_value=mock_records), \
         patch.object(engine, "fetch_market_comparisons", return_value=[]):

        result = engine.calculate(
            crop="Potato",
            variety="Kufri Jyoti",
            market="Kanpur APMC",
            asking_price=1400,
        )

        assert result.has_sufficient_data is True
        assert result.latest_modal == 1350.0
        assert result.recent_range_min == 1200.0
        assert result.recent_range_max == 1350.0
        assert result.recent_median == 1275.0
        assert result.trend == "Rising"  # earlier avg 1225 -> recent avg 1325 (+8.1%)
        assert result.difference_amount == 50.0  # 1400 - 1350
        assert result.difference_percentage == 3.7  # (50 / 1350) * 100
        assert "This is decision support, not a guaranteed future price" in result.disclaimer


def test_insufficient_data_returns_honest_response():
    """Test 15: Less than 3 observations honestly reports insufficient data."""
    engine = PriceDecisionEngine()

    # Only 1 record available
    mock_records = [
        {"source_commodity": "Dragonfruit", "source_variety": "Red", "market": "Local", "modal_price": 4000, "arrival_date": "2026-08-01", "unit": "₹ / quintal"},
    ]

    with patch.object(engine, "fetch_records", return_value=mock_records):
        result = engine.calculate(crop="Dragonfruit", variety="Red")

        assert result.has_sufficient_data is False
        assert result.trend == "Insufficient data"
        assert result.confidence == "Insufficient data"
        assert "Not enough verified market observations to provide a price estimate" in result.ai_interpretation


# ==============================================================================
# 5. RATE LIMITER TESTS
# ==============================================================================

def test_rate_limiter_throttles_excessive_requests():
    """Test 18: Rate limiter prevents request abuse."""
    limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=60)
    client_id = "test_ip_123"

    assert limiter.is_allowed(client_id) is True
    assert limiter.is_allowed(client_id) is True
    assert limiter.is_allowed(client_id) is True
    # 4th request within window is blocked
    assert limiter.is_allowed(client_id) is False
