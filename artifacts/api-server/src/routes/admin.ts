import { Router, type IRouter, type Request, type Response } from "express";
import { authUser, requireAuth, requireRole } from "../auth";

const router: IRouter = Router();
const fastApiBaseUrl = (process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

async function forward(req: Request, res: Response, path: string) {
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetPath = `${path}${query}`;
  const token = authUser(res)?.token;
  const headers = new Headers({ accept: "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (req.header("content-type")) headers.set("content-type", req.header("content-type")!);
  const upstream = await fetch(`${fastApiBaseUrl}${targetPath}`, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
  }).catch(() => null);
  if (!upstream) {
    res.status(503).json({ detail: "Admin service unavailable." });
    return;
  }
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("content-type", contentType);
  res.send(Buffer.from(await upstream.arrayBuffer()));
}

// Public published editorial content
router.get("/content", async (_req, res) => {
  const upstream = await fetch(`${fastApiBaseUrl}/api/content`).catch(() => null);
  if (!upstream) { res.status(503).json({ detail: "Content service unavailable." }); return; }
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("content-type", contentType);
  res.send(Buffer.from(await upstream.arrayBuffer()));
});

// Authenticated user reporting
router.post("/reports", requireAuth, (req, res) => forward(req, res, "/api/reports"));

// Admin routes (strictly require ADMIN role)
router.use("/admin", requireAuth, requireRole("ADMIN"));
router.get("/admin/dashboard", (req, res) => forward(req, res, "/api/admin/dashboard"));

// Users & Roles
router.get("/admin/users", (req, res) => forward(req, res, "/api/admin/users"));
router.patch("/admin/users/:userId/status", (req, res) => forward(req, res, `/api/admin/users/${encodeURIComponent(String(req.params.userId))}/status`));
router.get("/admin/farmers", (req, res) => forward(req, res, "/api/admin/farmers"));
router.get("/admin/buyers", (req, res) => forward(req, res, "/api/admin/buyers"));
router.get("/admin/consumers", (req, res) => forward(req, res, "/api/admin/consumers"));

// Drivers
router.get("/admin/drivers", (req, res) => forward(req, res, "/api/admin/drivers"));
router.patch("/admin/drivers/:driverId", (req, res) => forward(req, res, `/api/admin/drivers/${encodeURIComponent(String(req.params.driverId))}`));

// Listings
router.get("/admin/listings", (req, res) => forward(req, res, "/api/admin/listings"));
router.patch("/admin/listings/:listingId", (req, res) => forward(req, res, `/api/admin/listings/${encodeURIComponent(String(req.params.listingId))}`));

// Crops & Varieties Catalog
router.get("/admin/crops", (req, res) => forward(req, res, "/api/admin/crops"));
router.post("/admin/crops", (req, res) => forward(req, res, "/api/admin/crops"));
router.patch("/admin/crops/:cropId", (req, res) => forward(req, res, `/api/admin/crops/${encodeURIComponent(String(req.params.cropId))}`));
router.get("/admin/crops/:cropId/varieties", (req, res) => forward(req, res, `/api/admin/crops/${encodeURIComponent(String(req.params.cropId))}/varieties`));
router.post("/admin/crops/:cropId/varieties", (req, res) => forward(req, res, `/api/admin/crops/${encodeURIComponent(String(req.params.cropId))}/varieties`));
router.patch("/admin/varieties/:varietyId", (req, res) => forward(req, res, `/api/admin/varieties/${encodeURIComponent(String(req.params.varietyId))}`));

// Orders & Payments
router.get("/admin/orders", (req, res) => forward(req, res, "/api/admin/orders"));
router.get("/admin/payments", (req, res) => forward(req, res, "/api/admin/payments"));

// Logistics / Deliveries
router.get("/admin/deliveries", (req, res) => forward(req, res, "/api/admin/deliveries"));

// Market Data
router.get("/admin/market", (req, res) => forward(req, res, "/api/admin/market"));
router.post("/admin/market/sync", (req, res) => forward(req, res, "/api/admin/market/sync"));

// Media Moderation
router.get("/admin/media", (req, res) => forward(req, res, "/api/admin/media"));
router.patch("/admin/media/:mediaId", (req, res) => forward(req, res, `/api/admin/media/${encodeURIComponent(String(req.params.mediaId))}`));

// Reports / Complaints
router.get("/admin/reports", (req, res) => forward(req, res, "/api/admin/reports"));
router.patch("/admin/reports/:reportId", (req, res) => forward(req, res, `/api/admin/reports/${encodeURIComponent(String(req.params.reportId))}`));

// Content / Editorial & Platform Data
router.get("/admin/content", (req, res) => forward(req, res, "/api/admin/content"));
router.post("/admin/content", (req, res) => forward(req, res, "/api/admin/content"));
router.put("/admin/content/:contentId", (req, res) => forward(req, res, `/api/admin/content/${encodeURIComponent(String(req.params.contentId))}`));
router.delete("/admin/content/:contentId", (req, res) => forward(req, res, `/api/admin/content/${encodeURIComponent(String(req.params.contentId))}`));
router.get("/admin/platform-overview", (req, res) => forward(req, res, "/api/admin/platform-overview"));

// Notifications & Audit Logs
router.get("/admin/notifications", (req, res) => forward(req, res, "/api/admin/notifications"));
router.get("/admin/audit-logs", (req, res) => forward(req, res, "/api/admin/audit-logs"));
router.get("/admin/security-events", (req, res) => forward(req, res, "/api/admin/security-events"));

// Settings
router.get("/admin/settings", (req, res) => forward(req, res, "/api/admin/settings"));

export default router;