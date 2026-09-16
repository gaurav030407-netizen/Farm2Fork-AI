/**
 * Netlify Serverless Function for Farm2Fork Authentication & OTP.
 * Handles /api/auth/* routes directly in the cloud on Netlify (100% Free, No Credit Card).
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "farm2fork_super_secret_jwt_key_minimum_32_characters_long";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@farm2fork.store";

type AppRole = "FARMER" | "BUYER" | "CONSUMER" | "DRIVER" | "ADMIN";

type UserProfile = {
  id: string;
  name: string;
  email: string | null;
  role: AppRole;
  farmer_id?: string | null;
  buyer_id?: string | null;
};

// Supabase REST Helper
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

// Send OTP email via Resend
async function sendOtpEmail(toEmail: string, otp: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "Farm2Fork-App/1.0",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [toEmail],
        subject: "Your Farm2Fork verification code",
        text: `Your Farm2Fork verification code is ${otp}. It expires in 10 minutes.`,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("Resend error:", err);
    return false;
  }
}

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
  const path = url.pathname.replace(/^\/api\/auth\/?/, "").replace(/^\/\.netlify\/functions\/auth\/?/, "").trim();

  try {
    // --------------------------------------------------------------------------
    // 1. GET /api/auth/me
    // --------------------------------------------------------------------------
    if (req.method === "GET" && (path === "me" || path === "")) {
      const authHeader = req.headers.get("authorization") || "";
      const cookies = parseCookies(req.headers.get("cookie"));
      const token = authHeader.replace(/^Bearer\s+/i, "").trim() || cookies["farm2fork_auth"];

      if (!token) {
        return new Response(JSON.stringify({ detail: "Authentication required." }), { status: 401, headers: corsHeaders });
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id?: string; email?: string };
        if (!decoded?.id) {
          return new Response(JSON.stringify({ detail: "Invalid token session." }), { status: 401, headers: corsHeaders });
        }

        const profileRes = await supabaseRest<any[]>(`profiles?id=eq.${encodeURIComponent(decoded.id)}&select=id,name,email,role,account_status`);
        const profile = profileRes.data?.[0];
        if (!profile || profile.account_status !== "ACTIVE") {
          return new Response(JSON.stringify({ detail: "User profile not active." }), { status: 401, headers: corsHeaders });
        }

        let farmer_id: string | null = null;
        let buyer_id: string | null = null;

        if (profile.role === "FARMER") {
          const fRes = await supabaseRest<any[]>(`farmers?profile_id=eq.${profile.id}&select=id`);
          farmer_id = fRes.data?.[0]?.id || null;
        } else if (profile.role === "BUYER" || profile.role === "CONSUMER") {
          const bRes = await supabaseRest<any[]>(`buyers?profile_id=eq.${profile.id}&select=id`);
          buyer_id = bRes.data?.[0]?.id || null;
        }

        const user: UserProfile = {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          farmer_id,
          buyer_id,
        };

        return new Response(JSON.stringify({ user }), { status: 200, headers: corsHeaders });
      } catch {
        return new Response(JSON.stringify({ detail: "Session expired." }), { status: 401, headers: corsHeaders });
      }
    }

    // --------------------------------------------------------------------------
    // 2. POST /api/auth/otp/send
    // --------------------------------------------------------------------------
    if (req.method === "POST" && path === "otp/send") {
      const body = await req.json().catch(() => ({}));
      const method = (body.method || "EMAIL").toUpperCase();
      const identifier = (method === "EMAIL" ? body.email : body.mobile || "").trim().toLowerCase();

      if (!identifier) {
        return new Response(JSON.stringify({ detail: "Email address or mobile number is required." }), { status: 400, headers: corsHeaders });
      }

      // Check if profile exists
      const filter = method === "EMAIL" ? `email=eq.${encodeURIComponent(identifier)}` : `phone_number=eq.${encodeURIComponent(identifier)}`;
      const profileRes = await supabaseRest<any[]>(`profiles?${filter}&account_status=eq.ACTIVE&select=id,email,email_verified,phone_verified`);
      const profile = profileRes.data?.[0];

      // Generate 6-digit OTP
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const otpHash = await bcrypt.hash(otp, 10);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // Check if existing unconsumed challenge exists
      const chalRes = await supabaseRest<any[]>(`auth_otp_challenges?identifier=eq.${encodeURIComponent(identifier)}&purpose=eq.LOGIN&consumed_at=is.null&select=id`);
      const existing = chalRes.data?.[0];

      if (existing) {
        await supabaseRest(`auth_otp_challenges?id=eq.${existing.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            otp_hash: otpHash,
            profile_id: profile?.id || null,
            method,
            expires_at: expiresAt,
            attempts: 0,
            last_sent_at: new Date().toISOString(),
          }),
        });
      } else {
        await supabaseRest("auth_otp_challenges", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            identifier,
            method,
            purpose: "LOGIN",
            profile_id: profile?.id || null,
            otp_hash: otpHash,
            expires_at: expiresAt,
            attempts: 0,
            last_sent_at: new Date().toISOString(),
          }),
        });
      }

      // Deliver OTP via Resend if email
      if (method === "EMAIL" && profile?.email) {
        await sendOtpEmail(profile.email, otp);
      }

      return new Response(JSON.stringify({ ok: true, resendAvailableIn: 60 }), { status: 202, headers: corsHeaders });
    }

    // --------------------------------------------------------------------------
    // 3. POST /api/auth/otp/verify
    // --------------------------------------------------------------------------
    if (req.method === "POST" && path === "otp/verify") {
      const body = await req.json().catch(() => ({}));
      const method = (body.method || "EMAIL").toUpperCase();
      const identifier = (method === "EMAIL" ? body.email : body.mobile || "").trim().toLowerCase();
      const otp = String(body.otp || "").trim();

      if (!identifier || !otp) {
        return new Response(JSON.stringify({ detail: "Enter a valid contact and six-digit OTP." }), { status: 400, headers: corsHeaders });
      }

      // Fetch active challenge
      const chalRes = await supabaseRest<any[]>(
        `auth_otp_challenges?identifier=eq.${encodeURIComponent(identifier)}&purpose=eq.LOGIN&consumed_at=is.null&order=created_at.desc&limit=1`,
      );
      const challenge = chalRes.data?.[0];

      if (!challenge || new Date(challenge.expires_at).getTime() <= Date.now() || challenge.attempts >= 5) {
        return new Response(JSON.stringify({ detail: "Invalid or expired OTP." }), { status: 400, headers: corsHeaders });
      }

      const isValid = await bcrypt.compare(otp, challenge.otp_hash);
      if (!isValid) {
        await supabaseRest(`auth_otp_challenges?id=eq.${challenge.id}`, {
          method: "PATCH",
          body: JSON.stringify({ attempts: (challenge.attempts || 0) + 1 }),
        });
        return new Response(JSON.stringify({ detail: "Invalid OTP code." }), { status: 400, headers: corsHeaders });
      }

      // Mark challenge consumed
      await supabaseRest(`auth_otp_challenges?id=eq.${challenge.id}`, {
        method: "PATCH",
        body: JSON.stringify({ consumed_at: new Date().toISOString() }),
      });

      // Fetch user profile
      const filter = method === "EMAIL" ? `email=eq.${encodeURIComponent(identifier)}` : `phone_number=eq.${encodeURIComponent(identifier)}`;
      const profileRes = await supabaseRest<any[]>(`profiles?${filter}&account_status=eq.ACTIVE&select=id,name,email,role`);
      const profile = profileRes.data?.[0];

      if (!profile) {
        return new Response(JSON.stringify({ detail: "User profile not found." }), { status: 404, headers: corsHeaders });
      }

      let farmer_id: string | null = null;
      let buyer_id: string | null = null;

      if (profile.role === "FARMER") {
        const fRes = await supabaseRest<any[]>(`farmers?profile_id=eq.${profile.id}&select=id`);
        farmer_id = fRes.data?.[0]?.id || null;
      } else if (profile.role === "BUYER" || profile.role === "CONSUMER") {
        const bRes = await supabaseRest<any[]>(`buyers?profile_id=eq.${profile.id}&select=id`);
        buyer_id = bRes.data?.[0]?.id || null;
      }

      const user: UserProfile = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        farmer_id,
        buyer_id,
      };

      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });

      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.append(
        "Set-Cookie",
        `farm2fork_auth=${token}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax; Secure`,
      );

      return new Response(JSON.stringify({ user, token }), { status: 200, headers: responseHeaders });
    }

    // --------------------------------------------------------------------------
    // 4. POST /api/auth/login (Password)
    // --------------------------------------------------------------------------
    if (req.method === "POST" && path === "login") {
      const body = await req.json().catch(() => ({}));
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";

      if (!email || !password) {
        return new Response(JSON.stringify({ detail: "Email and password are required." }), { status: 400, headers: corsHeaders });
      }

      const profileRes = await supabaseRest<any[]>(
        `profiles?email=eq.${encodeURIComponent(email)}&account_status=eq.ACTIVE&select=id,name,email,role,password_hash`,
      );
      const profile = profileRes.data?.[0];

      if (!profile || !profile.password_hash) {
        return new Response(JSON.stringify({ detail: "Invalid email or password." }), { status: 401, headers: corsHeaders });
      }

      const match = await bcrypt.compare(password, profile.password_hash);
      if (!match) {
        return new Response(JSON.stringify({ detail: "Invalid email or password." }), { status: 401, headers: corsHeaders });
      }

      let farmer_id: string | null = null;
      let buyer_id: string | null = null;

      if (profile.role === "FARMER") {
        const fRes = await supabaseRest<any[]>(`farmers?profile_id=eq.${profile.id}&select=id`);
        farmer_id = fRes.data?.[0]?.id || null;
      } else if (profile.role === "BUYER" || profile.role === "CONSUMER") {
        const bRes = await supabaseRest<any[]>(`buyers?profile_id=eq.${profile.id}&select=id`);
        buyer_id = bRes.data?.[0]?.id || null;
      }

      const user: UserProfile = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        farmer_id,
        buyer_id,
      };

      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });

      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.append(
        "Set-Cookie",
        `farm2fork_auth=${token}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax; Secure`,
      );

      return new Response(JSON.stringify({ user, token }), { status: 200, headers: responseHeaders });
    }

    // --------------------------------------------------------------------------
    // 5. POST /api/auth/admin-login
    // --------------------------------------------------------------------------
    if (req.method === "POST" && path === "admin-login") {
      const body = await req.json().catch(() => ({}));
      const username = (body.username || "").trim();
      const password = body.password || "";

      if (username === "admin" && password === "admin0") {
        const user: UserProfile = {
          id: "1ae21473-212c-4922-88ff-8bcfe9a8cb0d",
          name: "System Administrator",
          email: "admin@farm2fork.local",
          role: "ADMIN",
        };
        const token = jwt.sign({ id: user.id, email: user.email, role: "ADMIN" }, JWT_SECRET, { expiresIn: "7d" });

        const responseHeaders = new Headers(corsHeaders);
        responseHeaders.append(
          "Set-Cookie",
          `farm2fork_auth=${token}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax; Secure`,
        );

        return new Response(JSON.stringify({ user, token }), { status: 200, headers: responseHeaders });
      }

      return new Response(JSON.stringify({ detail: "Invalid administrator credentials." }), { status: 401, headers: corsHeaders });
    }

    // --------------------------------------------------------------------------
    // 6. POST /api/auth/logout
    // --------------------------------------------------------------------------
    if (req.method === "POST" && path === "logout") {
      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.append(
        "Set-Cookie",
        "farm2fork_auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
      );
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: responseHeaders });
    }

    return new Response(JSON.stringify({ detail: `Auth path /${path} not found.` }), { status: 404, headers: corsHeaders });
  } catch (err) {
    console.error("Auth handler error:", err);
    return new Response(
      JSON.stringify({ detail: err instanceof Error ? err.message : "Authentication service error." }),
      { status: 500, headers: corsHeaders },
    );
  }
}

export const config = {
  path: "/api/auth/*",
};
