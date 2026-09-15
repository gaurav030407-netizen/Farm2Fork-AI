import { Router, type IRouter, type Request, type Response } from "express";
import { authUser, requireAuth } from "../auth";

const router: IRouter = Router();
const fastApiBaseUrl = (process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

async function forward(req: Request, res: Response, path: string): Promise<void> {
  const contentType = req.header("content-type");
  const headers = new Headers({ accept: "application/json", authorization: `Bearer ${authUser(res).token}` });
  if (contentType) headers.set("content-type", contentType);
  const isBodyRequest = !["GET", "HEAD"].includes(req.method);
  const isMultipart = contentType?.toLowerCase().startsWith("multipart/");
  const upstream = await fetch(`${fastApiBaseUrl}${path}`, {
    method: req.method,
    headers,
    body: isBodyRequest ? (isMultipart ? (req as unknown as import("node:stream").Readable) : JSON.stringify(req.body ?? {})) : undefined,
    ...(isMultipart ? { duplex: "half" } : {}),
  } as RequestInit & { duplex?: "half" }).catch((error: unknown) => {
    req.log.error({ err: error }, "FastAPI profile bridge unavailable");
    return null;
  });
  if (!upstream) { res.status(503).json({ detail: "Profile service unavailable." }); return; }
  res.status(upstream.status);
  upstream.headers.forEach((value, key) => { if (!["connection", "content-length", "transfer-encoding"].includes(key)) res.setHeader(key, value); });
  res.send(Buffer.from(await upstream.arrayBuffer()));
}

router.use("/profile", requireAuth);
router.get("/profile/me", (req, res) => forward(req, res, "/api/profile/me"));
router.patch("/profile/me", (req, res) => forward(req, res, "/api/profile/me"));
router.post("/profile/me/photo", (req, res) => forward(req, res, "/api/profile/me/photo"));
router.post("/profile/me/pan", (req, res) => forward(req, res, "/api/profile/me/pan"));
router.get("/profile/reverse-geocode", (req, res) => forward(req, res, `/api/profile/reverse-geocode?latitude=${encodeURIComponent(String(req.query.latitude ?? ""))}&longitude=${encodeURIComponent(String(req.query.longitude ?? ""))}`));
router.get("/profile/:userId", (req, res) => forward(req, res, `/api/profile/${encodeURIComponent(req.params.userId)}`));

export default router;