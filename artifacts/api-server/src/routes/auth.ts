import { Router, type IRouter } from "express";

const router: IRouter = Router();
const fastApiBaseUrl = (
  process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

router.use("/auth", async (req, res) => {
  const targetUrl = `${fastApiBaseUrl}${req.originalUrl}`;
  const headers = new Headers();
  const authorization = req.header("authorization");
  const contentType = req.header("content-type");

  if (authorization) headers.set("authorization", authorization);
  if (contentType) headers.set("content-type", contentType);

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  }).catch((error: unknown) => {
    req.log.error({ err: error }, "FastAPI auth bridge unavailable");
    return null;
  });

  if (!upstream) {
    res.status(503).json({ detail: "Authentication service unavailable." });
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