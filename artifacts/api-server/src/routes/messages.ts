import { Router, type IRouter, type Request, type Response } from "express";
import { authUser, requireAuth } from "../auth";
import { broadcastMessage } from "../message-hub";

const router: IRouter = Router();
const fastApiBaseUrl = (process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

async function forward(req: Request, res: Response, path: string) {
  const headers = new Headers({ accept: "application/json", authorization: `Bearer ${authUser(res).token}` });
  if (req.header("content-type")) headers.set("content-type", req.header("content-type")!);
  const upstream = await fetch(`${fastApiBaseUrl}${path}`, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
  }).catch((error: unknown) => {
    req.log.error({ err: error }, "FastAPI message bridge unavailable");
    return null;
  });
  if (!upstream) return res.status(503).json({ detail: "Message service unavailable." });
  const body = Buffer.from(await upstream.arrayBuffer());
  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (!["connection", "content-length", "transfer-encoding"].includes(key)) res.setHeader(key, value);
  });
  res.send(body);
  if (req.method === "POST" && path.endsWith("/messages") && upstream.ok) {
    try {
      const parsed = JSON.parse(body.toString()) as { conversation_id?: string };
      if (parsed.conversation_id) broadcastMessage(parsed.conversation_id, { type: "message:new", message: parsed });
    } catch {
      // The upstream response remains the source of truth even if notification fan-out fails.
    }
  }
  return;
}

router.use("/messages", requireAuth);
router.get("/messages/conversations", (req, res) => forward(req, res, "/api/messages/conversations"));
router.post("/messages/conversations", (req, res) => forward(req, res, "/api/messages/conversations"));
router.get("/messages/notifications", (req, res) => forward(req, res, "/api/messages/notifications"));
router.patch("/messages/notifications/conversations/:conversationId/read", (req, res) => forward(req, res, `/api/messages/notifications/conversations/${encodeURIComponent(req.params.conversationId)}/read`));
router.patch("/messages/notifications/:notificationId/read", (req, res) => forward(req, res, `/api/messages/notifications/${encodeURIComponent(req.params.notificationId)}/read`));
router.post("/messages/notifications/read-all", (req, res) => forward(req, res, "/api/messages/notifications/read-all"));
router.get("/messages/conversations/:conversationId/messages", (req, res) => forward(req, res, `/api/messages/conversations/${encodeURIComponent(req.params.conversationId)}/messages`));
router.post("/messages/conversations/:conversationId/messages", (req, res) => forward(req, res, `/api/messages/conversations/${encodeURIComponent(req.params.conversationId)}/messages`));
router.patch("/messages/messages/:messageId/read", (req, res) => forward(req, res, `/api/messages/messages/${encodeURIComponent(req.params.messageId)}/read`));

export default router;
