import { Router, type IRouter, type Request, type Response } from "express";
import { authUser, requireAuth } from "../auth";

const router: IRouter = Router();
const fastApiBaseUrl = (
  process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

async function forwardCallRequest(req: Request, res: Response, path: string) {
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
    req.log.error({ err: error }, "FastAPI call bridge unavailable");
    return null;
  });

  if (!upstream) {
    res.status(503).json({ detail: "Call service unavailable." });
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

router.use("/calls", requireAuth);
router.get("/calls", (req, res) => forwardCallRequest(req, res, "/api/calls"));
router.post("/calls", (req, res) => forwardCallRequest(req, res, "/api/calls"));
router.get("/calls/ice-config", (req, res) =>
  forwardCallRequest(req, res, "/api/calls/ice-config"),
);
router.get("/calls/:callId", (req, res) =>
  forwardCallRequest(req, res, `/api/calls/${encodeURIComponent(String(req.params.callId))}`),
);
router.post("/calls/:callId/accept", (req, res) =>
  forwardCallRequest(req, res, `/api/calls/${encodeURIComponent(String(req.params.callId))}/accept`),
);
router.post("/calls/:callId/decline", (req, res) =>
  forwardCallRequest(req, res, `/api/calls/${encodeURIComponent(String(req.params.callId))}/decline`),
);
router.post("/calls/:callId/end", (req, res) =>
  forwardCallRequest(req, res, `/api/calls/${encodeURIComponent(String(req.params.callId))}/end`),
);

export default router;
