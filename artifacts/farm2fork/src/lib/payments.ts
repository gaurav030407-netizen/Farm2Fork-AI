import { apiUrl } from "@/lib/api-url";

export type PaymentOrder = { payment_id: string; status: string; amount: number; currency: string; gateway_reference: string | null; gateway_public_key: string | null };

export async function createPayment(orderId: string): Promise<PaymentOrder> {
  const response = await fetch(apiUrl("/api/payments/create"), { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: orderId }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.detail ?? "Payment could not be started.");
  return body as PaymentOrder;
}

export async function verifyPayment(payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }): Promise<PaymentOrder> {
  const response = await fetch(apiUrl("/api/payments/verify"), { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.detail ?? "Payment verification failed.");
  return body as PaymentOrder;
}