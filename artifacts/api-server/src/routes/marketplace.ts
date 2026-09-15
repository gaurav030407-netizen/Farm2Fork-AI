import { Router, type IRouter } from "express";

const router: IRouter = Router();
const fastApiBaseUrl = (
  process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

router.get("/marketplace/listings", async (req, res) => {
  const upstream = await fetch(`${fastApiBaseUrl}/api/marketplace/listings`, {
    headers: { accept: "application/json" },
  }).catch((error: unknown) => {
    req.log.error({ err: error }, "FastAPI marketplace bridge unavailable");
    return null;
  });

  if (!upstream) {
    res.status(503).json({ detail: "Marketplace listing service unavailable." });
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

router.get("/marketplace/listings/:listingId", async (req, res) => {
  const upstream = await fetch(
    `${fastApiBaseUrl}/api/marketplace/listings/${encodeURIComponent(req.params.listingId)}`,
    { headers: { accept: "application/json" } },
  ).catch((error: unknown) => {
    req.log.error({ err: error }, "FastAPI marketplace detail bridge unavailable");
    return null;
  });

  if (!upstream) {
    res.status(503).json({ detail: "Marketplace listing service unavailable." });
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