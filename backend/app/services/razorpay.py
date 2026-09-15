from __future__ import annotations

import hashlib
import hmac
from decimal import Decimal

import httpx

from ..config import settings


class RazorpayConfigurationError(RuntimeError):
    pass


class RazorpayGateway:
    base_url = "https://api.razorpay.com/v1"

    def __init__(self) -> None:
        if settings.payment_gateway.lower() != "razorpay":
            raise RazorpayConfigurationError("PAYMENT_GATEWAY must be set to razorpay.")
        if not settings.payment_key_id or not settings.payment_key_secret:
            raise RazorpayConfigurationError("PAYMENT_KEY_ID and PAYMENT_KEY_SECRET are required for Razorpay.")

    def create_order(self, amount: Decimal, currency: str, receipt: str) -> dict:
        response = httpx.post(
            f"{self.base_url}/orders",
            auth=(settings.payment_key_id, settings.payment_key_secret),
            json={"amount": int(amount * 100), "currency": currency, "receipt": receipt, "payment_capture": 1},
            timeout=15,
        )
        if response.status_code >= 400:
            raise RuntimeError("Razorpay order creation failed.")
        return response.json()

    @staticmethod
    def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
        digest = hmac.new(
            settings.payment_key_secret.encode(),
            f"{order_id}|{payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(digest, signature)

    @staticmethod
    def verify_webhook(raw_body: bytes, signature: str) -> bool:
        digest = hmac.new(settings.payment_webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(digest, signature)
