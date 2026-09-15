import { Router, type IRouter } from "express";
import {
  CreateCropBody,
  CreateCropResponse,
  CreateLogisticsPlanBody,
  CreateLogisticsPlanResponse,
  GetCropParams,
  GetCropResponse,
  GetDashboardResponse,
  GetMarketInsightsResponse,
  ListCropsQueryParams,
  ListCropsResponse,
  UpdateCropBody,
  UpdateCropParams,
  UpdateCropResponse,
} from "@workspace/api-zod";

type Crop = ReturnType<typeof makeCrop>;
const cropImages = [
  "https://images.unsplash.com/photo-1546470427-227c7369a9e8?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=900&q=80",
];

function makeCrop(input: {
  id: number;
  crop: string;
  variety: string;
  category: string;
  farmer: string;
  location: string;
  quantity: number;
  unit: string;
  price: number;
  harvestDate: string;
  grade: string;
  organic: boolean;
  image: string;
  status: string;
}) {
  return input;
}

let crops: Crop[] = [
  makeCrop({
    id: 1,
    crop: "Tomatoes",
    variety: "Hybrid Roma",
    category: "Vegetables",
    farmer: "Ramesh Kumar",
    location: "Nashik, Maharashtra",
    quantity: 240,
    unit: "kg",
    price: 42,
    harvestDate: "2026-09-04",
    grade: "A",
    organic: true,
    image: cropImages[0],
    status: "active",
  }),
  makeCrop({
    id: 2,
    crop: "Alphonso Mangoes",
    variety: "Ratnagiri Alphonso",
    category: "Fruits",
    farmer: "Sunita Patil",
    location: "Ratnagiri, Maharashtra",
    quantity: 120,
    unit: "kg",
    price: 185,
    harvestDate: "2026-09-07",
    grade: "A+",
    organic: false,
    image: cropImages[3],
    status: "active",
  }),
  makeCrop({
    id: 3,
    crop: "Green Chilli",
    variety: "Fresh Long",
    category: "Vegetables",
    farmer: "Arjun FPO",
    location: "Guntur, Andhra Pradesh",
    quantity: 80,
    unit: "kg",
    price: 68,
    harvestDate: "2026-09-03",
    grade: "A",
    organic: true,
    image: cropImages[1],
    status: "active",
  }),
  makeCrop({
    id: 4,
    crop: "Okra",
    variety: "Tender Lady Finger",
    category: "Vegetables",
    farmer: "Meena Devi",
    location: "Bengaluru, Karnataka",
    quantity: 65,
    unit: "kg",
    price: 52,
    harvestDate: "2026-09-02",
    grade: "A",
    organic: true,
    image: cropImages[2],
    status: "active",
  }),
];

const router: IRouter = Router();

router.get("/crops", (req, res) => {
  const parsed = ListCropsQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid filters" });
  const { search, category } = parsed.data;
  const filtered = crops.filter((crop) => {
    const searchMatch =
      !search ||
      `${crop.crop} ${crop.variety} ${crop.location} ${crop.farmer}`
        .toLowerCase()
        .includes(search.toLowerCase());
    return searchMatch && (!category || crop.category === category);
  });
  return res.json(ListCropsResponse.parse(filtered));
});

router.post("/crops", (req, res) => {
  const parsed = CreateCropBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please complete all crop details" });
  const input = parsed.data;
  const crop = makeCrop({
    ...input,
    id: Math.max(...crops.map((item) => item.id)) + 1,
    farmer: "Ramesh Kumar",
    image: cropImages[crops.length % cropImages.length],
    status: "active",
  });
  crops = [crop, ...crops];
  return res.status(201).json(CreateCropResponse.parse(crop));
});

router.get("/crops/:id", (req, res) => {
  const parsed = GetCropParams.safeParse(req.params);
  const crop = parsed.success ? crops.find((item) => item.id === parsed.data.id) : undefined;
  if (!crop) return res.status(404).json({ error: "Crop listing not found" });
  return res.json(GetCropResponse.parse(crop));
});

router.patch("/crops/:id", (req, res) => {
  const params = UpdateCropParams.safeParse(req.params);
  const body = UpdateCropBody.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ error: "Invalid crop update" });
  const index = crops.findIndex((item) => item.id === params.data.id);
  if (index < 0) return res.status(404).json({ error: "Crop listing not found" });
  crops[index] = { ...crops[index], ...body.data };
  return res.json(UpdateCropResponse.parse(crops[index]));
});

router.get("/dashboard", (_req, res) => {
  return res.json(
    GetDashboardResponse.parse({
      activeListings: crops.filter((crop) => crop.status === "active").length,
      monthlyEarnings: 0,
      pendingOrders: 0,
      buyerReach: 128,
      averagePriceChange: 8.4,
      recentActivity: [],
    }),
  );
});

router.get("/insights", (_req, res) => {
  const fastApiBaseUrl = (
    process.env.FASTAPI_INTERNAL_URL ?? "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");

  return fetch(`${fastApiBaseUrl}/api/insights`, {
    headers: { accept: "application/json" },
  })
    .then(async (upstream) => {
      if (!upstream.ok) {
        const text = await upstream.text();
        return res.status(upstream.status).json({
          detail: text || "Market intelligence service unavailable.",
        });
      }

      const payload = await upstream.json();
      return res.json(GetMarketInsightsResponse.parse(payload));
    })
    .catch(() => {
      return res.status(503).json({
        detail: "Market intelligence service unavailable. Official public market data is not currently reachable.",
      });
    });
});

router.post("/logistics/plan", (req, res) => {
  const parsed = CreateLogisticsPlanBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose orders and a destination" });
  return res.json(
    CreateLogisticsPlanResponse.parse({
      distance: 212,
      estimatedDays: 1.4,
      estimatedCost: 680,
      co2Saved: 18.6,
      stops: parsed.data.orderIds.length + 1,
      route: [
        { label: "Pickup", location: "Nashik collection point", status: "complete" },
        { label: "Consolidation", location: "Pune cold hub", status: "next" },
        { label: "Delivery", location: parsed.data.destination, status: "planned" },
      ],
    }),
  );
});

export default router;