import { Router, type IRouter, type Request, type Response } from "express";
import { authUser, requireAuth, requireRole } from "../auth";

const router: IRouter = Router();
const fastApiBaseUrl = (process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

async function forward(req: Request, res: Response, path: string) {
  const headers = new Headers({ accept: "application/json", authorization: `Bearer ${authUser(res).token}` });
  if (req.header("content-type")) headers.set("content-type", req.header("content-type")!);
  const upstream = await fetch(`${fastApiBaseUrl}${path}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}) }).catch(() => null);
  if (!upstream) { res.status(503).json({ detail: "Driver service unavailable." }); return; }
  res.status(upstream.status);
  upstream.headers.forEach((value, key) => { if (!["connection", "content-length", "transfer-encoding"].includes(key)) res.setHeader(key, value); });
  res.send(Buffer.from(await upstream.arrayBuffer()));
}

router.post("/drivers/jobs/:jobId/delivery/verify", requireAuth, (req, res) => forward(req, res, `/api/drivers/jobs/${encodeURIComponent(String(req.params.jobId))}/delivery/verify`));
router.use("/drivers", requireAuth, requireRole("DRIVER"));
router.get("/drivers/me", (req, res) => forward(req, res, "/api/drivers/me"));
router.patch("/drivers/me", (req, res) => forward(req, res, "/api/drivers/me"));
router.get("/drivers/jobs", (req, res) => forward(req, res, "/api/drivers/jobs"));
router.get("/drivers/jobs/active", (req, res) => forward(req, res, "/api/drivers/jobs/active"));
router.post("/drivers/jobs/:jobId/accept", (req, res) => forward(req, res, `/api/drivers/jobs/${encodeURIComponent(String(req.params.jobId))}/accept`));
router.post("/drivers/jobs/:jobId/pickup/request", (req, res) => forward(req, res, `/api/drivers/jobs/${encodeURIComponent(String(req.params.jobId))}/pickup/request`));
router.post("/drivers/jobs/:jobId/pickup/verify", (req, res) => forward(req, res, `/api/drivers/jobs/${encodeURIComponent(String(req.params.jobId))}/pickup/verify`));
router.post("/drivers/jobs/:jobId/delivery/request", (req, res) => forward(req, res, `/api/drivers/jobs/${encodeURIComponent(String(req.params.jobId))}/delivery/request`));

export default router;
