import { Router, type IRouter, type Request, type Response } from "express";
import { authUser, requireAuth } from "../auth";

const router: IRouter = Router();
const fastApiBaseUrl = (process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

async function forward(req: Request, res: Response, path: string) {
  const headers = new Headers({ accept: "application/json", authorization: `Bearer ${authUser(res).token}` });
  if (req.header("content-type")) headers.set("content-type", req.header("content-type")!);
  const upstream = await fetch(`${fastApiBaseUrl}${path}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}) }).catch(() => null);
  if (!upstream) { res.status(503).json({ detail: "Payment service unavailable." }); return; }
  res.status(upstream.status);
  upstream.headers.forEach((value, key) => { if (!["connection", "content-length", "transfer-encoding"].includes(key)) res.setHeader(key, value); });
  res.send(Buffer.from(await upstream.arrayBuffer()));
}

async function forwardWebhook(req: Request, res: Response) {
  const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
  const signature = req.header("x-razorpay-signature");
  if (signature) headers.set("x-razorpay-signature", signature);
  const eventId = req.header("x-razorpay-event-id");
  if (eventId) headers.set("x-razorpay-event-id", eventId);
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  const upstream = await fetch(`${fastApiBaseUrl}/api/payments/webhook`, { method: "POST", headers, body: rawBody }).catch(() => null);
  if (!upstream) { res.status(503).json({ detail: "Payment service unavailable." }); return; }
  res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
}

router.post("/payments/webhook", forwardWebhook);
router.use("/payments", requireAuth);
router.post("/payments/create", (req, res) => forward(req, res, "/api/payments/create"));
router.post("/payments/verify", (req, res) => forward(req, res, "/api/payments/verify"));
router.get("/payments/:paymentId/receipt", (req, res) => forward(req, res, `/api/payments/${encodeURIComponent(String(req.params.paymentId))}/receipt`));

export default router;
