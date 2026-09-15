import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();
const fastApiBaseUrl = (process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

async function proxyMarket(req: Request, res: Response, path: string) {
  const query = new URLSearchParams();
  for (const key of ["commodity", "variety", "state", "district", "market", "limit", "offset", "date_from", "date_to", "search"]) {
    const value = req.query[key];
    if (typeof value === "string" && value.trim()) query.set(key, value);
  }
  const upstream = await fetch(`${fastApiBaseUrl}/api/market/${path}?${query.toString()}`, {
    headers: { accept: "application/json" },
  }).catch((error: unknown) => {
    req.log.error({ err: error }, "FastAPI market data bridge unavailable");
    return null;
  });
  if (!upstream) {
    res.status(503).json({ detail: "Market data service unavailable." });
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

router.get("/market/prices", (req, res) => proxyMarket(req, res, "prices"));
router.get("/market/crops", (req, res) => proxyMarket(req, res, "crops"));
router.get("/market/crops/:cropId/varieties", (req, res) => proxyMarket(req, res, `crops/${encodeURIComponent(req.params.cropId)}/varieties`));
router.get("/market/history", (req, res) => proxyMarket(req, res, "history"));
router.get("/market/status", (req, res) => proxyMarket(req, res, "status"));

export default router;
