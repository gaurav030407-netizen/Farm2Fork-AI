from __future__ import annotations

import os

import httpx

async def _email(to: str, subject: str, body: str) -> bool:
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    sender = os.getenv("EMAIL_FROM", "").strip()
    if not api_key or not sender:
        return False
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post("https://api.resend.com/emails", headers={"Authorization": f"Bearer {api_key}"}, json={"from": sender, "to": [to], "subject": subject, "text": body})
    return response.status_code < 300


async def _sms(to: str, body: str) -> bool:
    if os.getenv("SMS_TEST_MODE") == "true":
        return True
    if os.getenv("SMS_PROVIDER", "").strip().lower() != "msg91":
        return False
    api_key = os.getenv("SMS_API_KEY", "").strip()
    sender = os.getenv("SMS_SENDER_ID", "").strip()
    template_id = os.getenv("SMS_TEMPLATE_ID", "").strip()
    if not api_key or not sender or not template_id:
        return False
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post("https://control.msg91.com/api/v5/flow/", headers={"authkey": api_key}, json={"template_id": template_id, "sender": sender, "recipients": [{"mobiles": to.replace("+", ""), "VAR1": body}]})
    return response.status_code < 300


async def notify_payment(profile: dict, order_id: str, payment_id: str, amount: str) -> list[tuple[str, str, bool]]:
    message = f"Farm2Fork payment confirmed for order {order_id}. Receipt payment reference: {payment_id}. Amount: INR {amount}."
    channels = []
    if profile.get("email"):
        channels.append(("EMAIL", profile["email"], await _email(profile["email"], "Farm2Fork payment confirmed", message)))
    if profile.get("phone_number"):
        channels.append(("SMS", profile["phone_number"], await _sms(profile["phone_number"], message)))
    return channels
