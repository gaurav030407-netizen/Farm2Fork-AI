/**
 * Netlify Serverless Function for Farm2Fork Platform Data (Profiles, Listings, Market, Health).
 * Runs 100% free on Netlify directly querying Supabase PostgreSQL via PostgREST.
 */

import jwt from "jsonwebtoken";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "farm2fork_super_secret_jwt_key_minimum_32_characters_long";

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [name, ...val] = part.trim().split("=");
    if (name) cookies[name] = decodeURIComponent(val.join("="));
  }
  return cookies;
}

function getAuthUser(req: Request): { id: string; email?: string; role?: string } | null {
  const authHeader = req.headers.get("authorization") || "";
  const cookies = parseCookies(req.headers.get("cookie"));
  const token = authHeader.replace(/^Bearer\s+/i, "").trim() || cookies["farm2fork_auth"];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; email?: string; role?: string };
  } catch {
    return null;
  }
}

async function supabaseRest<T = any>(endpoint: string, options: RequestInit = {}): Promise<{ data: T | null; error: string | null; status: number }> {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint.replace(/^\/+/, "")}`;
  const headers = new Headers(options.headers);
  headers.set("apikey", SUPABASE_SERVICE_ROLE_KEY);
  headers.set("Authorization", `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`);
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  try {
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      return { data: null, error: typeof data === "object" && data?.message ? data.message : text, status: res.status };
    }
    return { data, error: null, status: res.status };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err), status: 500 };
  }
}

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Bypass-Tunnel-Reminder, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/^\/\.netlify\/functions\/api\/?/, "").trim();

  try {
    // 1. Healthz
    if (path === "healthz" || path === "health") {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: corsHeaders });
    }

    // 2. Profile Me (GET / PATCH)
    if (path === "profile/me") {
      const user = getAuthUser(req);
      if (!user) {
        return new Response(JSON.stringify({ detail: "Authentication required." }), { status: 401, headers: corsHeaders });
      }

      if (req.method === "GET") {
        const pRes = await supabaseRest<any[]>(`profiles?id=eq.${encodeURIComponent(user.id)}`);
        const profile = pRes.data?.[0];
        if (!profile) {
          return new Response(JSON.stringify({ detail: "Profile not found." }), { status: 404, headers: corsHeaders });
        }
        return new Response(JSON.stringify(profile), { status: 200, headers: corsHeaders });
      }

      if (req.method === "PATCH") {
        const body = await req.json().catch(() => ({}));
        delete body.id;
        delete body.password_hash;
        delete body.created_at;

        const pRes = await supabaseRest<any[]>(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(body),
        });
        return new Response(JSON.stringify(pRes.data?.[0] || {}), { status: 200, headers: corsHeaders });
      }
    }

    // 3. Crops & Varieties
    if (path === "crops") {
      const cRes = await supabaseRest<any[]>("crops?order=name.asc");
      return new Response(JSON.stringify(cRes.data || []), { status: 200, headers: corsHeaders });
    }

    if (path.startsWith("crops/") && path.endsWith("/varieties")) {
      const cropId = path.split("/")[1];
      const vRes = await supabaseRest<any[]>(`varieties?crop_id=eq.${encodeURIComponent(cropId)}&order=name.asc`);
      return new Response(JSON.stringify(vRes.data || []), { status: 200, headers: corsHeaders });
    }

    // 4. Marketplace Listings
    if (path === "marketplace/listings" || path === "farmer/listings") {
      const lRes = await supabaseRest<any[]>("crop_listings?status=eq.ACTIVE&order=created_at.desc&limit=50");
      return new Response(JSON.stringify(lRes.data || []), { status: 200, headers: corsHeaders });
    }

    // 5. Market Prices
    if (path.startsWith("market/prices") || path.startsWith("market/insights")) {
      const mRes = await supabaseRest<any[]>("market_prices?order=arrival_date.desc&limit=50");
      return new Response(JSON.stringify(mRes.data || []), { status: 200, headers: corsHeaders });
    }

    // Fallback: pass through to Supabase PostgREST for any other table
    const safePath = path.split("?")[0];
    if (/^[a-z0-9_-]+$/i.test(safePath)) {
      const qs = url.search ? url.search : "";
      const sRes = await supabaseRest(`${safePath}${qs}`, { method: req.method, body: req.method !== "GET" ? await req.text() : undefined });
      return new Response(JSON.stringify(sRes.data || []), { status: sRes.status, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ detail: `Endpoint /${path} not found.` }), { status: 404, headers: corsHeaders });
  } catch (err) {
    console.error("API handler error:", err);
    return new Response(
      JSON.stringify({ detail: err instanceof Error ? err.message : "Service error." }),
      { status: 500, headers: corsHeaders },
    );
  }
}

export const config = {
  path: "/api/*",
};
