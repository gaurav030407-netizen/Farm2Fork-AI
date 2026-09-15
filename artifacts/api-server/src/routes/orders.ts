import { Router, type IRouter, type Request, type Response } from "express";
import { authUser, requireAuth, requireRole } from "../auth";

const router: IRouter = Router();
const fastApiBaseUrl = (
  process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

async function forwardOrderRequest(req: Request, res: Response, path: string) {
  const contentType = req.header("content-type");
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${authUser(res).token}`,
  });
  if (contentType) headers.set("content-type", contentType);

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const upstream = await fetch(`${fastApiBaseUrl}${path}`, {
    method: req.method,
    headers,
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  }).catch((error: unknown) => {
    req.log.error({ err: error }, "FastAPI order bridge unavailable");
    return null;
  });

  if (!upstream) {
    res.status(503).json({ detail: "Order service unavailable." });
    return;
  }

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (!["connection", "content-length", "transfer-encoding"].includes(key)) {
      res.setHeader(key, value);
    }
  });
  res.send(Buffer.from(await upstream.arrayBuffer()));
}

router.use("/orders", requireAuth);
router.get("/orders", (req, res) => forwardOrderRequest(req, res, "/api/orders"));
router.post("/orders", (req, res) => forwardOrderRequest(req, res, "/api/orders"));
router.get("/orders/:orderId", (req, res) =>
  forwardOrderRequest(req, res, `/api/orders/${encodeURIComponent(String(req.params.orderId))}`),
);
router.post("/orders/:orderId/cancel", (req, res) =>
  forwardOrderRequest(req, res, `/api/orders/${encodeURIComponent(String(req.params.orderId))}/cancel`),
);
router.use("/farmer/orders", requireAuth, requireRole("FARMER"));
router.patch("/farmer/orders/:orderId/status", (req, res) =>
  forwardOrderRequest(req, res, `/api/farmer/orders/${encodeURIComponent(String(req.params.orderId))}/status`),
);
router.get("/farmer/orders", (req, res) =>
  forwardOrderRequest(req, res, "/api/farmer/orders"),
);

export default router;