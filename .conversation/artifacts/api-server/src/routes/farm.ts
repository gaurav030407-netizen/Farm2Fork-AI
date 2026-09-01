import { Router, type IRouter } from "express";
import {
  CreateCropBody,
  CreateCropResponse,
  CreateLogisticsPlanBody,
  CreateLogisticsPlanResponse,
  CreateOrderBody,
  CreateOrderResponse,
  GetCropParams,
  GetCropResponse,
  GetDashboardResponse,
  GetMarketInsightsResponse,
  ListCropsQueryParams,
  ListCropsResponse,
  ListOrdersQueryParams,
  ListOrdersResponse,
  UpdateCropBody,
  UpdateCropParams,
  UpdateCropResponse,
  UpdateOrderStatusBody,
  UpdateOrderStatusParams,
  UpdateOrderStatusResponse,
} from "@workspace/api-zod";

type Crop = ReturnType<typeof makeCrop>;
type Order = {
  id: number;
  crop: string;
  farmer: string;
  buyer: string;
  quantity: number;
  total: number;
  status: "pending" | "confirmed" | "in_transit" | "delivered" | "cancelled";
  placedAt: string;
  deliveryDate: string;
  location: string;
};

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

let orders: Order[] = [
  {
    id: 1042,
    crop: "Tomatoes",
    farmer: "Ramesh Kumar",
    buyer: "Green Basket Market",
    quantity: 60,
    total: 2520,
    status: "confirmed",
    placedAt: "Today, 9:42 AM",
    deliveryDate: "Sep 5, 2026",
    location: "Pune, Maharashtra",
  },
  {
    id: 1041,
    crop: "Green Chilli",
    farmer: "Arjun FPO",
    buyer: "FreshCart Kitchens",
    quantity: 25,
    total: 1700,
    status: "in_transit",
    placedAt: "Yesterday",
    deliveryDate: "Sep 3, 2026",
    location: "Hyderabad, Telangana",
  },
  {
    id: 1038,
    crop: "Okra",
    farmer: "Meena Devi",
    buyer: "Daily Harvest Co.",
    quantity: 40,
    total: 2080,
    status: "delivered",
    placedAt: "Aug 27, 2026",
    deliveryDate: "Aug 30, 2026",
    location: "Bengaluru, Karnataka",
  },
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

router.get("/orders", (req, res) => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid order filters" });
  const result =
    parsed.data.role === "buyer"
      ? orders.filter((order) => order.buyer === "Green Basket Market")
      : orders;
  return res.json(ListOrdersResponse.parse(result));
});

router.post("/orders", (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please choose a crop and quantity" });
  const crop = crops.find((item) => item.id === parsed.data.cropId);
  if (!crop) return res.status(404).json({ error: "Crop listing not found" });
  const order: Order = {
    id: Math.max(...orders.map((item) => item.id)) + 1,
    crop: crop.crop,
    farmer: crop.farmer,
    buyer: parsed.data.buyer,
    quantity: parsed.data.quantity,
    total: parsed.data.quantity * crop.price,
    status: "pending",
    placedAt: "Just now",
    deliveryDate: "Sep 8, 2026",
    location: crop.location,
  };
  orders = [order, ...orders];
  return res.status(201).json(CreateOrderResponse.parse(order));
});

router.patch("/orders/:id/status", (req, res) => {
  const params = UpdateOrderStatusParams.safeParse(req.params);
  const body = UpdateOrderStatusBody.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ error: "Invalid status update" });
  const index = orders.findIndex((item) => item.id === params.data.id);
  if (index < 0) return res.status(404).json({ error: "Order not found" });
  orders[index] = { ...orders[index], status: body.data.status };
  return res.json(UpdateOrderStatusResponse.parse(orders[index]));
});

router.get("/dashboard", (_req, res) => {
  const pendingOrders = orders.filter((order) => order.status === "pending").length;
  return res.json(
    GetDashboardResponse.parse({
      activeListings: crops.filter((crop) => crop.status === "active").length,
      monthlyEarnings: orders
        .filter((order) => order.farmer === "Ramesh Kumar" && order.status !== "cancelled")
        .reduce((sum, order) => sum + order.total, 0),
      pendingOrders,
      buyerReach: 128,
      averagePriceChange: 8.4,
      recentActivity: [
        { id: 1, title: "New order received", description: "Green Basket Market ordered 60 kg of Tomatoes", time: "12 min ago", type: "order" },
        { id: 2, title: "Price update", description: "Tomato prices are up 8.4% this week", time: "2 hrs ago", type: "insight" },
        { id: 3, title: "Listing viewed", description: "Your Tomatoes listing was viewed 24 times", time: "Yesterday", type: "view" },
      ],
    }),
  );
});

router.get("/insights", (_req, res) => {
  return res.json(
    GetMarketInsightsResponse.parse({
      crop: "Tomatoes",
      demand: "High demand",
      demandScore: 86,
      estimatedPrice: 46,
      priceUnit: "per kg",
      priceChange: 8.4,
      recommendation: "Hold for 2–3 days. Demand from Pune buyers is rising and prices are trending upward.",
      seasonality: [
        { month: "Jun", value: 48 },
        { month: "Jul", value: 54 },
        { month: "Aug", value: 67 },
        { month: "Sep", value: 86 },
        { month: "Oct", value: 72 },
        { month: "Nov", value: 58 },
      ],
    }),
  );
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