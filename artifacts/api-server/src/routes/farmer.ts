import { Router, type IRouter } from "express";
import { authUser, requireAuth, requireRole } from "../auth";

const router: IRouter = Router();
const fastApiBaseUrl = (
  process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

router.use("/farmer", requireAuth, requireRole("FARMER"), async (req, res) => {
  const targetUrl = `${fastApiBaseUrl}${req.originalUrl}`;
  const contentType = req.header("content-type");
  const headers = new Headers();
  const authorization = `Bearer ${authUser(res).token}`;
  const contentLength = req.header("content-length");

  headers.set("authorization", authorization);
  if (contentType) headers.set("content-type", contentType);
  if (contentLength) headers.set("content-length", contentLength);

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const isMultipart = contentType?.toLowerCase().startsWith("multipart/");
  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: hasBody
      ? isMultipart
        ? (req as unknown as import("node:stream").Readable)
        : JSON.stringify(req.body ?? {})
      : undefined,
    ...(isMultipart ? { duplex: "half" } : {}),
  } as RequestInit & { duplex?: "half" }).catch((error: unknown) => {
    req.log.error({ err: error }, "FastAPI farmer bridge unavailable");
    return null;
  });

  if (!upstream) {
    res.status(503).json({ detail: "Farmer listing service unavailable." });
    return;
  }

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (!["connection", "content-length", "transfer-encoding"].includes(key)) {
      res.setHeader(key, value);
    }
  });
  res.send(Buffer.from(await upstream.arrayBuffer()));
});

export default router;