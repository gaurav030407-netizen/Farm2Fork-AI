import bcrypt from "bcryptjs";
import jwt, { type Algorithm, type JwtPayload, type SignOptions } from "jsonwebtoken";
import type { Request, RequestHandler } from "express";
import pg from "pg";

const { Pool } = pg;
const jwtSecret = process.env.JWT_SECRET ?? "";
if (jwtSecret.length < 32) throw new Error("JWT_SECRET must be set to a strong value for authentication.");
const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
if (!/^\d+(?:\s*(?:ms|s|m|h|d|w|y|seconds?|minutes?|hours?|days?))?$/i.test(jwtExpiresIn)) {
  throw new Error("JWT_EXPIRES_IN must be a positive duration.");
}
const durationMatch = /^(\d+)\s*(ms|s|m|h|d|w|y|seconds?|minutes?|hours?|days?)?$/i.exec(jwtExpiresIn);
const durationUnits: Record<string, number> = {
  ms: 1,
  s: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
};
const durationAmount = Number(durationMatch?.[1]);
const durationUnit = (durationMatch?.[2] ?? "ms").toLowerCase();
export const sessionCookieMaxAgeMs = durationAmount * durationUnits[durationUnit];
if (!Number.isSafeInteger(sessionCookieMaxAgeMs) || sessionCookieMaxAgeMs <= 0) {
  throw new Error("JWT_EXPIRES_IN must be a supported positive duration.");
}
const configuredAlgorithm = process.env.JWT_ALGORITHM ?? "HS256";
if (!(["HS256", "HS384", "HS512"] as const).includes(configuredAlgorithm as "HS256" | "HS384" | "HS512")) {
  throw new Error("JWT_ALGORITHM must be a supported HMAC algorithm.");
}
const jwtAlgorithm = configuredAlgorithm as Algorithm;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl || !/^postgres(?:ql)?(?:\+[a-z0-9_-]+)?:\/\//i.test(databaseUrl)) {
  throw new Error("DATABASE_URL must be a valid PostgreSQL connection string.");
}
export const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
});

pool.on("error", (err) => {
  console.warn("Notice: idle database connection reset by remote pooler", err.message);
});

pool.query("SELECT 1").catch(() => undefined);

export type AppRole = "FARMER" | "BUYER" | "CONSUMER" | "DRIVER" | "ADMIN";
export type AuthenticatedUser = { id: string; email: string | null; name: string; role: AppRole; token: string };

type Claims = JwtPayload & { sub: string; id: string; email?: string | null; role: AppRole };

export function issueToken(user: Pick<AuthenticatedUser, "id" | "email" | "role">): string {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret, { subject: user.id, expiresIn: jwtExpiresIn as SignOptions["expiresIn"], algorithm: jwtAlgorithm });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function userFromToken(token: string): Promise<AuthenticatedUser | null> {
  try {
    const claims = jwt.verify(token, jwtSecret, { algorithms: [jwtAlgorithm] }) as unknown as Claims;
    if (!claims.sub || claims.id !== claims.sub || !["FARMER", "BUYER", "CONSUMER", "DRIVER", "ADMIN"].includes(claims.role)) return null;
    const result = await pool.query(
      "SELECT id, email, name, role FROM public.profiles WHERE id = $1 AND role = $2 AND account_status = 'ACTIVE' AND ((email IS NULL AND $3::text IS NULL) OR lower(email) = lower($3)) AND (email_verified = true OR phone_verified = true)",
      [claims.sub, claims.role, claims.email],
    );
    const row = result.rows[0];
    return row ? { id: row.id, email: row.email, name: row.name, role: row.role, token } : null;
  } catch {
    return null;
  }
}

export async function tokenFromRequest(request: Request): Promise<string | null> {
  return request.cookies?.farm2fork_auth ?? null;
}

export const requireAuth: RequestHandler = async (request, response, next) => {
  const token = await tokenFromRequest(request);
  const user = token ? await userFromToken(token) : null;
  if (!user) {
    response.status(401).json({ detail: "Authentication required." });
    return;
  }
  response.locals.user = user;
  next();
};

export const optionalAuth: RequestHandler = async (request, response, next) => {
  const token = await tokenFromRequest(request);
  const user = token ? await userFromToken(token) : null;
  if (user) {
    response.locals.user = user;
  }
  next();
};

export function requireRole(...roles: AppRole[]): RequestHandler {
  return (request, response, next) => {
    const user = response.locals.user as AuthenticatedUser | undefined;
    if (!user || !roles.includes(user.role)) {
      response.status(403).json({ detail: "You do not have permission for this operation." });
      return;
    }
    next();
  };
}

export function authUser(response: Parameters<RequestHandler>[1]): AuthenticatedUser {
  return response.locals.user as AuthenticatedUser;
}
