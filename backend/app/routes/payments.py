from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..auth import AuthenticatedUser, get_current_user
from ..config import settings
from ..database.connection import get_engine
from ..schemas.driver import PaymentCreateResponse, PaymentVerifyRequest, ReceiptResponse
from ..services.razorpay import RazorpayConfigurationError, RazorpayGateway
from ..services.notifications import notify_payment

router = APIRouter(prefix="/api/payments", tags=["payments"])


class PaymentCreateRequest(BaseModel):
    order_id: UUID
    payment_method: str | None = Field(default=None, max_length=80)


class WebhookRequest(BaseModel):
    event_id: str = Field(min_length=1, max_length=200)
    event_type: str = Field(min_length=1, max_length=120)
    payment_id: str = Field(min_length=1, max_length=200)
    order_id: UUID
    amount: float = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3)
    status: str


def _is_order_party(connection, order_id: UUID, user: AuthenticatedUser) -> bool:
    return bool(connection.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM public.orders o
            JOIN public.buyers b ON b.id = o.buyer_id
            JOIN public.farmers f ON f.id = o.farmer_id
            WHERE o.id = :order_id AND (b.profile_id = :profile_id OR f.profile_id = :profile_id)
        )
    """), {"order_id": order_id, "profile_id": user.id}).scalar())


@router.post("/create", response_model=PaymentCreateResponse, status_code=201)
def create_payment(payload: PaymentCreateRequest, user: AuthenticatedUser = Depends(get_current_user)) -> PaymentCreateResponse:
    if user.role not in {"BUYER", "CONSUMER"}:
        raise HTTPException(status_code=403, detail="Only buyers and consumers can create payments.")
    try:
        gateway = RazorpayGateway()
    except RazorpayConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    with get_engine().begin() as connection:
        buyer = connection.execute(text("SELECT o.total_amount, o.payment_status, o.id FROM public.orders o JOIN public.buyers b ON b.id = o.buyer_id WHERE o.id = :order_id AND b.profile_id = :profile_id FOR UPDATE"), {"order_id": payload.order_id, "profile_id": user.id}).mappings().one_or_none()
        if buyer is None:
            raise HTTPException(status_code=404, detail="Order not found.")
        if buyer["payment_status"] in {"PAID", "AUTHORIZED"}:
            raise HTTPException(status_code=409, detail="This order already has an authorized payment.")
        gateway_order = gateway.create_order(Decimal(str(buyer["total_amount"])), "INR", str(payload.order_id))
        payment = connection.execute(text("INSERT INTO public.payments (order_id, payer_profile_id, status, amount, currency, payment_method, gateway_reference) VALUES (:order_id, :payer, 'PENDING', :amount, 'INR', :method, :gateway_reference) RETURNING id, status, amount, currency, gateway_reference"), {"order_id": payload.order_id, "payer": user.id, "amount": buyer["total_amount"], "method": payload.payment_method, "gateway_reference": gateway_order["id"]}).mappings().one()
        connection.execute(text("UPDATE public.orders SET payment_status = 'PENDING', updated_at = now() WHERE id = :order_id"), {"order_id": payload.order_id})
    return PaymentCreateResponse(payment_id=payment["id"], status=payment["status"], amount=float(payment["amount"]), currency=payment["currency"], gateway_reference=payment["gateway_reference"], gateway_public_key=settings.payment_key_id)


@router.post("/verify", response_model=PaymentCreateResponse)
def verify_payment(payload: PaymentVerifyRequest, user: AuthenticatedUser = Depends(get_current_user)) -> PaymentCreateResponse:
    try:
        gateway = RazorpayGateway()
    except RazorpayConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    if not gateway.verify_signature(payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed.")
    with get_engine().begin() as connection:
        payment = connection.execute(text("""
            SELECT p.id, p.status, p.amount, p.currency, p.gateway_reference
            FROM public.payments p JOIN public.orders o ON o.id = p.order_id
            JOIN public.buyers b ON b.id = o.buyer_id
            WHERE p.gateway_reference = :gateway_reference AND b.profile_id = :profile_id
            FOR UPDATE
        """), {"gateway_reference": payload.razorpay_order_id, "profile_id": user.id}).mappings().one_or_none()
        if payment is None:
            raise HTTPException(status_code=404, detail="Payment order not found.")
        if payment["status"] == "PAID":
            return PaymentCreateResponse(payment_id=payment["id"], status=payment["status"], amount=float(payment["amount"]), currency=payment["currency"], gateway_reference=payment["gateway_reference"], gateway_public_key=settings.payment_key_id)
        connection.execute(text("UPDATE public.payments SET status = 'AUTHORIZED', provider_payment_id = :provider_id, updated_at = now() WHERE id = :id"), {"provider_id": payload.razorpay_payment_id, "id": payment["id"]})
        connection.execute(text("UPDATE public.orders SET payment_status = 'AUTHORIZED', updated_at = now() WHERE id = (SELECT order_id FROM public.payments WHERE id = :id)"), {"id": payment["id"]})
    return PaymentCreateResponse(payment_id=payment["id"], status="AUTHORIZED", amount=float(payment["amount"]), currency=payment["currency"], gateway_reference=payment["gateway_reference"], gateway_public_key=settings.payment_key_id)


@router.post("/webhook")
async def payment_webhook(request: Request, x_razorpay_signature: str | None = Header(default=None)) -> dict:
    if not settings.payment_webhook_secret:
        raise HTTPException(status_code=503, detail="PAYMENT_WEBHOOK_SECRET is not configured on the server.")
    raw = await request.body()
    expected = hmac.new(settings.payment_webhook_secret.encode(), raw, hashlib.sha256).hexdigest()
    if not x_razorpay_signature or not hmac.compare_digest(expected, x_razorpay_signature):
        raise HTTPException(status_code=401, detail="Invalid Razorpay webhook signature.")
    try:
        payload = json.loads(raw)
        event_type = str(payload["event"])
        entity = payload["payload"].get("payment", {}).get("entity") or payload["payload"].get("refund", {}).get("entity")
        if not isinstance(entity, dict): raise ValueError
    except (ValueError, TypeError, KeyError):
        raise HTTPException(status_code=400, detail="Invalid Razorpay webhook payload.") from None
    event_id = request.headers.get("x-razorpay-event-id") or hashlib.sha256(raw).hexdigest()
    status_map = {
        "payment.captured": "PAID",
        "payment.authorized": "AUTHORIZED",
        "payment.failed": "FAILED",
        "order.cancelled": "CANCELLED",
        "refund.created": "PARTIALLY_REFUNDED",
        "refund.processed": "REFUNDED",
    }
    payment_status = status_map.get(event_type)
    if payment_status is None:
        return {"ok": True, "ignored": True}
    gateway_order_id = entity.get("order_id")
    provider_payment_id = entity.get("payment_id") or entity.get("id")
    notification_profiles: list[dict] = []
    with get_engine().begin() as connection:
        existing = connection.execute(text("SELECT id FROM public.payment_events WHERE provider_event_id = :event_id FOR UPDATE"), {"event_id": event_id}).scalar_one_or_none()
        if existing:
            return {"ok": True, "duplicate": True}
        payment = connection.execute(text("SELECT id, order_id, amount, currency FROM public.payments WHERE gateway_reference = :gateway_order_id OR provider_payment_id = :provider_payment_id FOR UPDATE"), {"gateway_order_id": gateway_order_id, "provider_payment_id": provider_payment_id}).mappings().one_or_none()
        if payment is None:
            raise HTTPException(status_code=400, detail="Razorpay payment does not match a Farm2Fork payment.")
        amount_paise = entity.get("amount")
        if amount_paise is not None and payment_status in {"PAID", "AUTHORIZED"} and abs(float(payment["amount"]) * 100 - float(amount_paise)) > 0.009:
            raise HTTPException(status_code=400, detail="Razorpay amount does not match the order.")
        payload_hash = hashlib.sha256(raw).hexdigest()
        connection.execute(text("INSERT INTO public.payment_events (payment_id, provider_event_id, event_type, payload_hash, processed_at) VALUES (:payment_id, :event_id, :event_type, :payload_hash, now())"), {"payment_id": payment["id"], "event_id": event_id, "event_type": event_type, "payload_hash": payload_hash})
        connection.execute(text("UPDATE public.payments SET status = :status, provider_payment_id = COALESCE(:provider_id, provider_payment_id), paid_at = CASE WHEN :status = 'PAID' THEN now() ELSE paid_at END, updated_at = now() WHERE id = :payment_id"), {"status": payment_status, "provider_id": provider_payment_id, "payment_id": payment["id"]})
        connection.execute(text("UPDATE public.orders SET payment_status = :status, updated_at = now() WHERE id = :order_id"), {"status": payment_status, "order_id": payment["order_id"]})
        if payment_status == "PAID":
            connection.execute(text("INSERT INTO public.transaction_receipts (payment_id, reference) VALUES (:payment_id, :reference) ON CONFLICT (payment_id) DO NOTHING"), {"payment_id": payment["id"], "reference": f"F2F-{secrets.token_hex(8).upper()}"})
            notification_profiles = [dict(row) for row in connection.execute(text("""
                SELECT buyer_profile.email, buyer_profile.phone_number
                FROM public.orders o JOIN public.buyers b ON b.id = o.buyer_id
                JOIN public.profiles buyer_profile ON buyer_profile.id = b.profile_id
                WHERE o.id = :order_id
                UNION ALL
                SELECT farmer_profile.email, farmer_profile.phone_number
                FROM public.orders o JOIN public.farmers f ON f.id = o.farmer_id
                JOIN public.profiles farmer_profile ON farmer_profile.id = f.profile_id
                WHERE o.id = :order_id
            """), {"order_id": payment["order_id"]}).mappings().all()]
    if payment_status == "PAID":
        for profile in notification_profiles:
            results = await notify_payment(profile, str(payment["order_id"]), str(payment["id"]), str(payment["amount"]))
            with get_engine().begin() as connection:
                for channel, _identifier, sent in results:
                    connection.execute(text("INSERT INTO public.notification_records (profile_id, kind, channel, status, reference_id, sent_at, last_error) SELECT p.id, 'PAYMENT_CONFIRMED', :channel, :status, :reference_id, CASE WHEN :sent THEN now() ELSE NULL END, CASE WHEN :sent THEN NULL ELSE 'Provider unavailable or delivery failed' END FROM public.profiles p WHERE p.email = :email OR p.phone_number = :phone"), {"channel": channel, "status": "SENT" if sent else "FAILED", "reference_id": payment["id"], "sent": sent, "email": profile.get("email"), "phone": profile.get("phone_number")})
    return {"ok": True, "duplicate": False}


@router.get("/{payment_id}/receipt", response_model=ReceiptResponse)
def get_receipt(payment_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> ReceiptResponse:
    with get_engine().connect() as connection:
        row = connection.execute(text("""
            SELECT r.reference, p.id AS payment_id, p.order_id, p.status, p.amount, p.currency, r.created_at
            FROM public.transaction_receipts r
            JOIN public.payments p ON p.id = r.payment_id
            WHERE p.id = :payment_id
        """), {"payment_id": payment_id}).mappings().one_or_none()
        if row is None or not _is_order_party(connection, row["order_id"], user):
            raise HTTPException(status_code=404, detail="Receipt not found.")
    return ReceiptResponse(**dict(row))
