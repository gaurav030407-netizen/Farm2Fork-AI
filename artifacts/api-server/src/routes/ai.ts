import { Router, type IRouter, type Request, type Response } from "express";
import { optionalAuth, requireAuth, type AuthenticatedUser } from "../auth";

const router: IRouter = Router();
const fastApiBaseUrl = (
  process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

async function forwardAiRequest(req: Request, res: Response, subpath: string) {
  const user = res.locals.user as AuthenticatedUser | undefined;
  const headers = new Headers({
    accept: "application/json",
  });

  if (user?.token) {
    headers.set("authorization", `Bearer ${user.token}`);
  }

  const contentType = req.header("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const upstream = await fetch(`${fastApiBaseUrl}/api/ai/${subpath}`, {
    method: req.method,
    headers,
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  }).catch((error: unknown) => {
    req.log.error({ err: error }, "FastAPI AI bridge unavailable");
    return null;
  });

  if (!upstream) {
    res.status(503).json({
      detail: "AI assistance is temporarily unavailable.",
      code: "AI_UNAVAILABLE",
    });
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

// Public / optionally authenticated endpoints
router.post("/ai/chat", optionalAuth, (req, res) => forwardAiRequest(req, res, "chat"));
router.post("/ai/price-assistant", optionalAuth, (req, res) => forwardAiRequest(req, res, "price-assistant"));
router.get("/ai/status", optionalAuth, (req, res) => forwardAiRequest(req, res, "status"));

// Authenticated endpoints for conversation management
router.get("/ai/conversations", requireAuth, (req, res) => forwardAiRequest(req, res, "conversations"));
router.get("/ai/conversations/:id/messages", requireAuth, (req, res) =>
  forwardAiRequest(req, res, `conversations/${encodeURIComponent(String(req.params.id))}/messages`),
);
router.delete("/ai/conversations/:id", requireAuth, (req, res) =>
  forwardAiRequest(req, res, `conversations/${encodeURIComponent(String(req.params.id))}`),
);

export default router;
