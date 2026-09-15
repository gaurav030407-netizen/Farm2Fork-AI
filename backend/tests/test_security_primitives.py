"""Regression coverage for provider signatures and one-time delivery codes."""

import hashlib
import hmac
import os

os.environ.setdefault("DATABASE_URL", "postgresql://user:password@localhost:5432/farm2fork")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-at-least-thirty-two-characters")
os.environ.setdefault("PAYMENT_GATEWAY", "razorpay")
os.environ.setdefault("PAYMENT_KEY_SECRET", "razorpay-test-secret")
os.environ.setdefault("PAYMENT_KEY_ID", "rzp_test_key")
os.environ.setdefault("PAYMENT_WEBHOOK_SECRET", "webhook-test-secret")

from backend.app.config import settings
from backend.app.routes.driver import _hash_otp, _new_otp, _verify_otp
from backend.app.services.razorpay import RazorpayGateway

object.__setattr__(settings, "payment_key_secret", "razorpay-test-secret")
object.__setattr__(settings, "payment_webhook_secret", "webhook-test-secret")
object.__setattr__(settings, "payment_gateway", "razorpay")
object.__setattr__(settings, "payment_key_id", "rzp_test_key")


def test_delivery_otp_is_hashed_and_only_matches_once_when_consumed_by_state():
    otp, stored = _new_otp()
    assert otp not in stored
    assert _verify_otp(otp, stored)
    assert not _verify_otp("000000" if otp != "000000" else "999999", stored)


def test_razorpay_payment_signature_requires_exact_order_and_payment_ids():
    order_id = "order_test"
    payment_id = "pay_test"
    signature = hmac.new(b"razorpay-test-secret", f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    assert RazorpayGateway.verify_signature(order_id, payment_id, signature)
    assert not RazorpayGateway.verify_signature(order_id, "pay_other", signature)


def test_razorpay_webhook_signature_rejects_changed_body():
    body = b'{"event":"payment.captured"}'
    signature = hmac.new(b"webhook-test-secret", body, hashlib.sha256).hexdigest()
    assert RazorpayGateway.verify_webhook(body, signature)
    assert not RazorpayGateway.verify_webhook(body + b" ", signature)
