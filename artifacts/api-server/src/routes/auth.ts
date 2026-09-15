import { Router, type CookieOptions, type IRouter } from "express";
import { randomInt, randomUUID } from "node:crypto";
import { authUser, hashPassword, issueToken, pool, requireAuth, sessionCookieMaxAgeMs, verifyPassword, type AppRole } from "../auth";
import { sendVerificationEmail } from "../email";
import { isSmsProviderConfigured, smsProvider } from "../sms";

const router: IRouter = Router();
const cookieName = "farm2fork_auth";
const isProduction = process.env.NODE_ENV === "production";
const cookieBaseOptions: CookieOptions = { httpOnly: true, secure: isProduction, sameSite: isProduction ? "none" : "lax", path: "/" };
const cookieOptions = { ...cookieBaseOptions, maxAge: sessionCookieMaxAgeMs };
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const OTP_METHODS = new Set(["EMAIL", "SMS"]);

function takeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function validEmail(value: unknown): string | null {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^\S+@\S+\.\S+$/.test(email) ? email : null;
}

function validMobile(value: unknown): string | null {
  const mobile = typeof value === "string" ? value.replace(/[\s()-]/g, "") : "";
  if (!/^\+?[1-9]\d{9,14}$/.test(mobile)) return null;
  return mobile.startsWith("+") ? mobile : `+${mobile}`;
}

function otpMethod(value: unknown): "EMAIL" | "SMS" | null {
  const method = typeof value === "string" ? value.trim().toUpperCase() : "";
  return OTP_METHODS.has(method) ? method as "EMAIL" | "SMS" : null;
}

async function deliverOtp(method: "EMAIL" | "SMS", identifier: string, otp: string): Promise<void> {
  if (method === "EMAIL") await sendVerificationEmail(identifier, otp);
  else await smsProvider.sendOtp(identifier, otp);
}

async function audit(profileId: string | null, eventType: string, identifier: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
  await pool.query("INSERT INTO public.security_audit_events (profile_id, event_type, identifier, metadata) VALUES ($1, $2, $3, $4)", [profileId, eventType, identifier, JSON.stringify(metadata)]);
}

function safeOtpFailure(error: unknown): { code: string; detail: string } {
  const message = error instanceof Error ? error.message : "";
  const databaseCode = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (databaseCode === "42P01" || /relation .* does not exist/i.test(message)) return { code: "DATABASE_SCHEMA_MISSING", detail: "OTP database migrations are not applied. Run migrations 017, 018, and 019." };
  if (/MSG91 SMS requires|SMS provider is not configured/i.test(message)) return { code: "SMS_PROVIDER_NOT_CONFIGURED", detail: "Mobile OTP service is not configured." };
  if (/email OTP|RESEND|Email delivery/i.test(message)) return { code: "EMAIL_PROVIDER_UNAVAILABLE", detail: "Email OTP service is unavailable or not configured." };
  return { code: "AUTH_SERVICE_UNAVAILABLE", detail: "Authentication service is temporarily unavailable." };
}

function validOtp(value: unknown): string | null {
  const otp = typeof value === "string" ? value.trim() : "";
  return /^\d{6}$/.test(otp) ? otp : null;
}

function createOtp(): string {
  return String(randomInt(100_000, 1_000_000));
}

function registration(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = validEmail(body.email);
  const mobile = validMobile(body.mobile);
  const method = otpMethod(body.otp_method) ?? (mobile && !email ? "SMS" : "EMAIL");
  const password = typeof body.password === "string" ? body.password : "";
  const role: AppRole | null = body.role === "FARMER" || body.role === "farmer" ? "FARMER" : body.role === "CONSUMER" || body.role === "consumer" ? "CONSUMER" : body.role === "DRIVER" || body.role === "driver" ? "DRIVER" : body.role === "BUYER" || body.role === "buyer" ? "BUYER" : null;
  if (!name || name.length > 120) return { error: "Enter a name of up to 120 characters." };
  if (!email && !mobile) return { error: "Enter a valid email address or mobile number." };
  if (method === "EMAIL" && !email) return { error: "Enter an email address to receive the OTP." };
  if (method === "SMS" && !mobile) return { error: "Enter a mobile number to receive the OTP." };
  if (password.length < 8 || password.length > 128) return { error: "Password must be between 8 and 128 characters." };
  if (!role) return { error: "Choose a valid Farm2Fork role." };
  return { name, email, mobile, method, password, role };
}

router.post("/auth/register", async (request, response) => {
  if (!takeRateLimit(`register:${request.ip}`, 10, 15 * 60 * 1000)) { response.status(429).json({ detail: "Too many registration attempts. Please try again later." }); return; }
  const parsed = registration(request.body as Record<string, unknown>);
  if ("error" in parsed) { response.status(400).json({ detail: parsed.error }); return; }
  const mobile = parsed.mobile;
  const location = typeof request.body.location === "string" ? request.body.location.trim() : "";
  const organizationName = parsed.role === "FARMER"
    ? (typeof request.body.farm_name === "string" && request.body.farm_name.trim() ? request.body.farm_name.trim() : `${parsed.name}'s Farm`)
    : (typeof request.body.business_name === "string" ? request.body.business_name.trim() : "");
  if (parsed.role !== "CONSUMER" && !location) { response.status(400).json({ detail: "Location and required account details are missing." }); return; }
  const client = await pool.connect();
  const otp = createOtp();
  const otpHash = await hashPassword(otp);
  const passwordHash = await hashPassword(parsed.password);
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT 1 FROM public.profiles WHERE (email IS NOT NULL AND lower(email) = $1) OR (phone_number IS NOT NULL AND phone_number = $2)", [parsed.email, mobile]);
    if (existing.rowCount) { await client.query("ROLLBACK"); response.status(409).json({ detail: "That contact is already registered." }); return; }
    const pending = await client.query("SELECT id, otp_last_sent_at FROM public.pending_registrations WHERE (email IS NOT NULL AND lower(email) = $1) OR (mobile IS NOT NULL AND mobile = $2) FOR UPDATE", [parsed.email, mobile]);
    const lastSentAt = pending.rows[0]?.otp_last_sent_at ? new Date(pending.rows[0].otp_last_sent_at).getTime() : 0;
    const remaining = OTP_RESEND_COOLDOWN_MS - (Date.now() - lastSentAt);
    if (remaining > 0) { await client.query("ROLLBACK"); response.status(429).json({ detail: "Please wait before requesting another code.", resendAvailableIn: Math.ceil(remaining / 1000) }); return; }
    if (pending.rows[0]) await client.query("UPDATE public.pending_registrations SET email = $1, name = $2, password_hash = $3, role = $4, mobile = $5, location = $6, organization_name = $7, otp_method = $8, otp_hash = $9, otp_expires_at = now() + interval '10 minutes', otp_attempts = 0, otp_last_sent_at = now() WHERE id = $10", [parsed.email, parsed.name, passwordHash, parsed.role, mobile, location || null, organizationName || null, parsed.method, otpHash, pending.rows[0].id]);
    else await client.query("INSERT INTO public.pending_registrations (email, name, password_hash, role, mobile, location, organization_name, otp_method, otp_hash, otp_expires_at, otp_attempts, otp_last_sent_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + interval '10 minutes', 0, now())", [parsed.email, parsed.name, passwordHash, parsed.role, mobile, location || null, organizationName || null, parsed.method, otpHash]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); request.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Registration failed"); response.status(500).json({ detail: "Registration could not be completed." }); return; } finally { client.release(); }
  try {
    await deliverOtp(parsed.method, parsed.method === "EMAIL" ? parsed.email! : mobile!, otp);
    await audit(null, "OTP_REQUESTED", parsed.method === "EMAIL" ? parsed.email : mobile, { method: parsed.method, purpose: "REGISTRATION" });
  } catch (error) {
    await pool.query("DELETE FROM public.pending_registrations WHERE (email IS NOT NULL AND lower(email) = $1) OR (mobile IS NOT NULL AND mobile = $2)", [parsed.email, mobile]);
    request.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Verification OTP delivery failed");
    response.status(503).json({ detail: "We could not send the verification code. Check server OTP provider configuration." });
    return;
  }
  response.status(202).json({ needsEmailConfirmation: parsed.method === "EMAIL", needsOtpConfirmation: true, otpMethod: parsed.method, resendAvailableIn: 60 });
});

router.post("/auth/verify-email", async (request, response) => {
  if (!takeRateLimit(`verify:${request.ip}`, 20, 15 * 60 * 1000)) { response.status(429).json({ detail: "Too many verification attempts. Please try again later." }); return; }
  const email = validEmail(request.body.email);
  const otp = validOtp(request.body.otp);
  if (!email || !otp) { response.status(400).json({ detail: "Enter your email and six-digit verification code." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM public.pending_registrations WHERE lower(email) = $1 FOR UPDATE", [email]);
    const pending = result.rows[0];
    if (!pending) { await client.query("ROLLBACK"); response.status(400).json({ detail: "Invalid email or verification code." }); return; }
    if (!pending.otp_hash || !pending.otp_expires_at || new Date(pending.otp_expires_at).getTime() <= Date.now()) {
      await client.query("DELETE FROM public.pending_registrations WHERE id = $1", [pending.id]);
      await client.query("COMMIT");
      response.status(400).json({ detail: "Verification code expired. Request a new code." });
      return;
    }
    if (pending.otp_attempts >= OTP_MAX_ATTEMPTS) { await client.query("DELETE FROM public.pending_registrations WHERE id = $1", [pending.id]); await client.query("COMMIT"); response.status(429).json({ detail: "Too many incorrect codes. Request a new code." }); return; }
    if (!(await verifyPassword(otp, pending.otp_hash))) {
      const attempts = pending.otp_attempts + 1;
      if (attempts >= OTP_MAX_ATTEMPTS) await client.query("DELETE FROM public.pending_registrations WHERE id = $1", [pending.id]);
      else await client.query("UPDATE public.pending_registrations SET otp_attempts = $1 WHERE id = $2", [attempts, pending.id]);
      await client.query("COMMIT");
      response.status(attempts >= OTP_MAX_ATTEMPTS ? 429 : 400).json({ detail: attempts >= OTP_MAX_ATTEMPTS ? "Too many incorrect codes. Request a new code." : "Invalid verification code." });
      return;
    }
    const existing = await client.query("SELECT 1 FROM public.profiles WHERE lower(email) = $1 AND email_verified = true", [email]);
    if (existing.rowCount) { await client.query("ROLLBACK"); response.status(409).json({ detail: "Email is already registered." }); return; }
    const id = randomUUID();
    await client.query("INSERT INTO public.profiles (id, name, email, password_hash, role, mobile, phone_number, location, email_verified, email_verified_at, phone_verified, phone_verified_at) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, true, now(), $8, CASE WHEN $8 THEN now() ELSE NULL END)", [id, pending.name, pending.email, pending.password_hash, pending.role, pending.mobile, pending.location, pending.mobile != null]);
    if (pending.role === "FARMER") await client.query("INSERT INTO public.farmers (profile_id, farm_name, location) VALUES ($1, $2, $3)", [id, pending.organization_name, pending.location]);
    else if (pending.role === "DRIVER") await client.query("INSERT INTO public.drivers (profile_id, service_area, vehicle_type) VALUES ($1, $2, 'UNSPECIFIED')", [id, pending.location]);
    else await client.query("INSERT INTO public.buyers (profile_id, business_name, location) VALUES ($1, $2, $3)", [id, pending.role === "CONSUMER" ? null : pending.organization_name, pending.location]);
    await client.query("DELETE FROM public.pending_registrations WHERE id = $1", [pending.id]);
    await client.query("COMMIT");
    response.json({ ok: true });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); request.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Email verification failed"); response.status(500).json({ detail: "Email verification could not be completed." }); } finally { client.release(); }
});

router.post("/auth/verify-otp", async (request, response) => {
  if (!takeRateLimit(`verify-otp:${request.ip}`, 20, 15 * 60 * 1000)) { response.status(429).json({ detail: "Too many verification attempts. Please try again later." }); return; }
  const email = validEmail(request.body.email);
  const mobile = validMobile(request.body.mobile);
  const otp = validOtp(request.body.otp);
  const identifier = email ?? mobile;
  if (!identifier || !otp) { response.status(400).json({ detail: "Enter a valid contact and six-digit verification code." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pending = (await client.query("SELECT * FROM public.pending_registrations WHERE (email IS NOT NULL AND lower(email) = $1) OR (mobile IS NOT NULL AND mobile = $2) FOR UPDATE", [email, mobile])).rows[0];
    if (!pending || pending.otp_method !== "SMS" || !pending.otp_hash || new Date(pending.otp_expires_at).getTime() <= Date.now() || pending.otp_attempts >= OTP_MAX_ATTEMPTS) { await client.query("ROLLBACK"); response.status(400).json({ detail: "Invalid or expired verification code." }); return; }
    if (!(await verifyPassword(otp, pending.otp_hash))) { await client.query("UPDATE public.pending_registrations SET otp_attempts = otp_attempts + 1 WHERE id = $1", [pending.id]); await client.query("COMMIT"); response.status(400).json({ detail: "Invalid verification code." }); return; }
    const id = randomUUID();
    await client.query("INSERT INTO public.profiles (id, name, email, password_hash, role, mobile, phone_number, location, email_verified, phone_verified, phone_verified_at) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, false, true, now())", [id, pending.name, pending.email, pending.password_hash, pending.role, pending.mobile, pending.location]);
    if (pending.role === "FARMER") await client.query("INSERT INTO public.farmers (profile_id, farm_name, location) VALUES ($1, $2, $3)", [id, pending.organization_name, pending.location]);
    else if (pending.role === "DRIVER") await client.query("INSERT INTO public.drivers (profile_id, service_area, vehicle_type) VALUES ($1, $2, 'UNSPECIFIED')", [id, pending.location]);
    else await client.query("INSERT INTO public.buyers (profile_id, business_name, location) VALUES ($1, $2, $3)", [id, pending.role === "CONSUMER" ? null : pending.organization_name, pending.location]);
    await client.query("DELETE FROM public.pending_registrations WHERE id = $1", [pending.id]);
    await client.query("COMMIT");
    await audit(id, "OTP_VERIFIED", identifier, { method: "SMS", purpose: "REGISTRATION" });
    response.json({ ok: true });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); request.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Mobile verification failed"); response.status(500).json({ detail: "Verification could not be completed." }); } finally { client.release(); }
});

router.post("/auth/otp/send", async (request, response) => {
  if (!takeRateLimit(`otp-send:${request.ip}`, 10, 15 * 60 * 1000)) { response.status(429).json({ detail: "Too many OTP requests. Please try again later." }); return; }
  const method = otpMethod(request.body.method);
  const identifier = method === "EMAIL" ? validEmail(request.body.email) : validMobile(request.body.mobile);
  if (!method || !identifier) { response.status(400).json({ detail: "Choose Email or Mobile and provide a valid contact." }); return; }
  if (method === "SMS" && !isSmsProviderConfigured()) { response.status(503).json({ detail: "Mobile OTP service is not configured.", code: "SMS_PROVIDER_NOT_CONFIGURED" }); return; }
  const client = await pool.connect();
  const otp = createOtp();
  const otpHash = await hashPassword(otp);
  try {
    await client.query("BEGIN");
    const profile = await client.query("SELECT id, email, phone_number, email_verified, phone_verified FROM public.profiles WHERE account_status = 'ACTIVE' AND ((email IS NOT NULL AND lower(email) = $1) OR (phone_number IS NOT NULL AND phone_number = $2))", [method === "EMAIL" ? identifier : null, method === "SMS" ? identifier : null]);
    const row = profile.rows[0];
    const valid = row && ((method === "EMAIL" && row.email_verified) || (method === "SMS" && row.phone_verified));
    const existing = await client.query("SELECT id, last_sent_at FROM public.auth_otp_challenges WHERE identifier = $1 AND purpose = 'LOGIN' AND consumed_at IS NULL FOR UPDATE", [identifier]);
    const remaining = existing.rows[0] ? OTP_RESEND_COOLDOWN_MS - (Date.now() - new Date(existing.rows[0].last_sent_at).getTime()) : 0;
    if (remaining > 0) { await client.query("ROLLBACK"); response.status(429).json({ detail: "Please wait before requesting another code.", resendAvailableIn: Math.ceil(remaining / 1000) }); return; }
    if (existing.rows[0]) await client.query("UPDATE public.auth_otp_challenges SET otp_hash = $1, profile_id = $2, method = $3, expires_at = now() + interval '10 minutes', attempts = 0, last_sent_at = now() WHERE id = $4", [otpHash, valid ? row.id : null, method, existing.rows[0].id]);
    else await client.query("INSERT INTO public.auth_otp_challenges (identifier, method, purpose, profile_id, otp_hash, expires_at) VALUES ($1, $2, 'LOGIN', $3, $4, now() + interval '10 minutes')", [identifier, method, valid ? row.id : null, otpHash]);
    await client.query("COMMIT");
    if (valid) await deliverOtp(method, identifier, otp);
    await audit(valid ? row.id : null, "OTP_REQUESTED", identifier, { method, purpose: "LOGIN" });
    response.status(202).json({ ok: true, resendAvailableIn: 60 });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); const failure = safeOtpFailure(error); request.log.error({ errorType: error instanceof Error ? error.name : "UnknownError", category: failure.code }, "Login OTP preparation failed"); response.status(failure.code === "DATABASE_SCHEMA_MISSING" ? 500 : 503).json({ detail: failure.detail, code: failure.code }); } finally { client.release(); }
});

router.post("/auth/otp/verify", async (request, response) => {
  if (!takeRateLimit(`otp-verify:${request.ip}`, 20, 15 * 60 * 1000)) { response.status(429).json({ detail: "Too many OTP attempts. Please try again later." }); return; }
  const method = otpMethod(request.body.method);
  const identifier = method === "EMAIL" ? validEmail(request.body.email) : validMobile(request.body.mobile);
  const otp = validOtp(request.body.otp);
  if (!method || !identifier || !otp) { response.status(400).json({ detail: "Enter a valid contact and six-digit OTP." }); return; }
  const result = await pool.query("SELECT c.id, c.otp_hash, c.attempts, c.expires_at, p.id AS profile_id, p.name, p.email, p.role FROM public.auth_otp_challenges c JOIN public.profiles p ON p.id = c.profile_id WHERE c.identifier = $1 AND c.method = $2 AND c.purpose = 'LOGIN' AND c.consumed_at IS NULL AND p.account_status = 'ACTIVE' FOR UPDATE", [identifier, method]);
  const row = result.rows[0];
  if (!row || row.attempts >= OTP_MAX_ATTEMPTS || new Date(row.expires_at).getTime() <= Date.now()) { response.status(400).json({ detail: "Invalid or expired OTP." }); return; }
  if (!(await verifyPassword(otp, row.otp_hash))) { await pool.query("UPDATE public.auth_otp_challenges SET attempts = attempts + 1 WHERE id = $1", [row.id]); await audit(row.profile_id, "OTP_FAILED", identifier, { method, purpose: "LOGIN" }); response.status(400).json({ detail: "Invalid OTP." }); return; }
  await pool.query("UPDATE public.auth_otp_challenges SET consumed_at = now() WHERE id = $1", [row.id]);
  await audit(row.profile_id, "OTP_VERIFIED", identifier, { method, purpose: "LOGIN" });
  const user = { id: row.profile_id, name: row.name, email: row.email, role: row.role as AppRole };
  response.cookie(cookieName, issueToken(user), cookieOptions).json({ user });
});

router.post("/auth/contact/change/send", requireAuth, async (request, response) => {
  const user = authUser(response);
  if (!takeRateLimit(`contact-change:${user.id}`, 6, 15 * 60 * 1000)) { response.status(429).json({ detail: "Too many contact change requests. Please try again later." }); return; }
  const contactType = request.body.contact_type === "EMAIL" ? "EMAIL" : request.body.contact_type === "PHONE" ? "PHONE" : null;
  const newValue = contactType === "EMAIL" ? validEmail(request.body.new_value) : validMobile(request.body.new_value);
  const method = contactType === "EMAIL" ? "EMAIL" : "SMS";
  if (!contactType || !newValue) { response.status(400).json({ detail: "Enter a valid new email address or mobile number." }); return; }
  const client = await pool.connect();
  const otp = createOtp();
  const otpHash = await hashPassword(otp);
  try {
    await client.query("BEGIN");
    const duplicate = contactType === "EMAIL"
      ? await client.query("SELECT 1 FROM public.profiles WHERE lower(email) = $1 AND id <> $2 UNION SELECT 1 FROM public.pending_registrations WHERE lower(email) = $1", [newValue, user.id])
      : await client.query("SELECT 1 FROM public.profiles WHERE phone_number = $1 AND id <> $2 UNION SELECT 1 FROM public.pending_registrations WHERE mobile = $1", [newValue, user.id]);
    if (duplicate.rowCount) { await client.query("ROLLBACK"); response.status(409).json({ detail: "That contact is already linked to another account." }); return; }
    const current = await client.query("SELECT id, last_sent_at FROM public.contact_change_challenges WHERE profile_id = $1 AND contact_type = $2 AND verified_at IS NULL FOR UPDATE", [user.id, contactType]);
    const remaining = current.rows[0] ? OTP_RESEND_COOLDOWN_MS - (Date.now() - new Date(current.rows[0].last_sent_at).getTime()) : 0;
    if (remaining > 0) { await client.query("ROLLBACK"); response.status(429).json({ detail: "Please wait before requesting another code.", resendAvailableIn: Math.ceil(remaining / 1000) }); return; }
    if (current.rows[0]) await client.query("UPDATE public.contact_change_challenges SET new_value = $1, otp_method = $2, otp_hash = $3, expires_at = now() + interval '10 minutes', attempts = 0, last_sent_at = now() WHERE id = $4", [newValue, method, otpHash, current.rows[0].id]);
    else await client.query("INSERT INTO public.contact_change_challenges (profile_id, contact_type, new_value, otp_method, otp_hash, expires_at) VALUES ($1, $2, $3, $4, $5, now() + interval '10 minutes')", [user.id, contactType, newValue, method, otpHash]);
    await client.query("COMMIT");
    await deliverOtp(method, newValue, otp);
    await audit(user.id, "OTP_REQUESTED", newValue, { method, purpose: "CONTACT_CHANGE", contactType });
    response.status(202).json({ ok: true, resendAvailableIn: 60 });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); request.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Contact change OTP delivery failed"); response.status(503).json({ detail: "The new contact could not be verified because the OTP provider is unavailable." }); } finally { client.release(); }
});

router.post("/auth/contact/change/verify", requireAuth, async (request, response) => {
  const user = authUser(response);
  const contactType = request.body.contact_type === "EMAIL" ? "EMAIL" : request.body.contact_type === "PHONE" ? "PHONE" : null;
  const otp = validOtp(request.body.otp);
  if (!contactType || !otp) { response.status(400).json({ detail: "Enter the contact type and six-digit OTP." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const challenge = (await client.query("SELECT * FROM public.contact_change_challenges WHERE profile_id = $1 AND contact_type = $2 AND verified_at IS NULL FOR UPDATE", [user.id, contactType])).rows[0];
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS || new Date(challenge.expires_at).getTime() <= Date.now()) { await client.query("ROLLBACK"); response.status(400).json({ detail: "Invalid or expired contact verification code." }); return; }
    if (!(await verifyPassword(otp, challenge.otp_hash))) { await client.query("UPDATE public.contact_change_challenges SET attempts = attempts + 1 WHERE id = $1", [challenge.id]); await client.query("COMMIT"); await audit(user.id, "OTP_FAILED", challenge.new_value, { purpose: "CONTACT_CHANGE", contactType }); response.status(400).json({ detail: "Invalid contact verification code." }); return; }
    if (contactType === "EMAIL") await client.query("UPDATE public.profiles SET email = $1, email_verified = true, email_verified_at = now(), updated_at = now() WHERE id = $2", [challenge.new_value, user.id]);
    else await client.query("UPDATE public.profiles SET mobile = $1, phone_number = $1, phone_verified = true, phone_verified_at = now(), updated_at = now() WHERE id = $2", [challenge.new_value, user.id]);
    await client.query("UPDATE public.contact_change_challenges SET verified_at = now() WHERE id = $1", [challenge.id]);
    await client.query("COMMIT");
    await audit(user.id, contactType === "EMAIL" ? "EMAIL_CHANGED" : "PHONE_CHANGED", challenge.new_value, { purpose: "CONTACT_CHANGE" });
    response.json({ ok: true });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); request.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Contact change verification failed"); response.status(500).json({ detail: "The contact could not be changed." }); } finally { client.release(); }
});

router.delete("/auth/account", requireAuth, async (request, response) => {
  const user = authUser(response);
  if (request.body.confirmation !== "DELETE") { response.status(400).json({ detail: "Type DELETE to confirm account deletion.", code: "CONFIRMATION_REQUIRED" }); return; }
  const password = typeof request.body.password === "string" ? request.body.password : "";
  const otp = validOtp(request.body.otp);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const profile = (await client.query("SELECT id, password_hash, email, phone_number FROM public.profiles WHERE id = $1 AND account_status = 'ACTIVE' FOR UPDATE", [user.id])).rows[0];
    if (!profile) { await client.query("ROLLBACK"); response.status(401).json({ detail: "Account is no longer active." }); return; }
    let reauthenticated = Boolean(password && profile.password_hash && await verifyPassword(password, profile.password_hash));
    if (!reauthenticated && otp) {
      const challenge = (await client.query("SELECT id, otp_hash, attempts, expires_at FROM public.auth_otp_challenges WHERE profile_id = $1 AND consumed_at IS NULL AND purpose IN ('LOGIN', 'DELETE_ACCOUNT') FOR UPDATE", [user.id])).rows[0];
      if (challenge && challenge.attempts < OTP_MAX_ATTEMPTS && new Date(challenge.expires_at).getTime() > Date.now() && await verifyPassword(otp, challenge.otp_hash)) {
        await client.query("UPDATE public.auth_otp_challenges SET consumed_at = now() WHERE id = $1", [challenge.id]);
        reauthenticated = true;
      }
    }
    if (!reauthenticated) { await client.query("ROLLBACK"); response.status(401).json({ detail: "Re-authentication failed. Use your password or a verified OTP.", code: "REAUTHENTICATION_REQUIRED" }); return; }
    const active = await client.query("SELECT EXISTS (SELECT 1 FROM public.orders WHERE (buyer_id IN (SELECT id FROM public.buyers WHERE profile_id = $1) OR farmer_id IN (SELECT id FROM public.farmers WHERE profile_id = $1)) AND status NOT IN ('DELIVERED', 'CANCELLED', 'REJECTED')) AS has_active_orders, EXISTS (SELECT 1 FROM public.payments WHERE payer_profile_id = $1 AND status IN ('PENDING', 'AUTHORIZED')) AS has_pending_payments, EXISTS (SELECT 1 FROM public.delivery_jobs dj JOIN public.drivers d ON d.id = dj.driver_id WHERE d.profile_id = $1 AND dj.status IN ('ACCEPTED', 'PICKED_UP')) AS has_active_delivery", [user.id]);
    const activeState = active.rows[0];
    if (activeState.has_active_orders || activeState.has_pending_payments || activeState.has_active_delivery) { await client.query("ROLLBACK"); response.status(409).json({ detail: "Account has an active order, payment, or delivery. Complete or resolve it before deletion.", code: "ACTIVE_TRANSACTIONS" }); return; }
    await client.query("UPDATE public.crop_listings SET status = 'INACTIVE', updated_at = now() WHERE farmer_id IN (SELECT id FROM public.farmers WHERE profile_id = $1) AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.crop_listing_id = crop_listings.id)", [user.id]);
    await client.query("UPDATE public.drivers SET availability_status = 'OFFLINE', approval_status = 'SUSPENDED', updated_at = now() WHERE profile_id = $1", [user.id]);
    await client.query("UPDATE public.profiles SET name = 'Deleted User', email = NULL, mobile = NULL, phone_number = NULL, profile_photo_path = NULL, bio = NULL, email_verified = false, phone_verified = false, password_hash = NULL, account_status = 'DELETED', deleted_at = now(), updated_at = now() WHERE id = $1", [user.id]);
    await client.query("INSERT INTO public.security_audit_events (profile_id, event_type, metadata) VALUES ($1, 'ACCOUNT_DELETED', '{\"retained_financial_records\":true}'::jsonb)", [user.id]);
    await client.query("COMMIT");
    response.clearCookie(cookieName, cookieBaseOptions).json({ ok: true });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); request.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Account deletion failed"); response.status(500).json({ detail: "Account deletion could not be completed.", code: "ACCOUNT_DELETION_FAILED" }); } finally { client.release(); }
});

router.post("/auth/change-password", requireAuth, async (request, response) => {
  const user = authUser(response);
  const currentPassword = typeof request.body.current_password === "string" ? request.body.current_password : "";
  const newPassword = typeof request.body.new_password === "string" ? request.body.new_password : "";
  if (!currentPassword) { response.status(400).json({ detail: "Enter your current password." }); return; }
  if (newPassword.length < 8 || newPassword.length > 128) { response.status(400).json({ detail: "New password must be between 8 and 128 characters." }); return; }
  const result = await pool.query("SELECT password_hash FROM public.profiles WHERE id = $1 AND account_status = 'ACTIVE'", [user.id]);
  const row = result.rows[0];
  if (!row || !row.password_hash || !(await verifyPassword(currentPassword, row.password_hash))) {
    response.status(401).json({ detail: "Current password is incorrect." });
    return;
  }
  const newHash = await hashPassword(newPassword);
  await pool.query("UPDATE public.profiles SET password_hash = $1, updated_at = now() WHERE id = $2", [newHash, user.id]);
  await audit(user.id, "PASSWORD_CHANGED", null, { purpose: "SECURITY" });
  response.json({ ok: true });
});

router.patch("/auth/security-settings", requireAuth, async (request, response) => {
  const user = authUser(response);
  const method = otpMethod(request.body.preferred_otp_method);
  if (!method) { response.status(400).json({ detail: "Preferred OTP method must be EMAIL or SMS." }); return; }
  await pool.query("UPDATE public.profiles SET preferred_otp_method = $1, updated_at = now() WHERE id = $2", [method, user.id]);
  await audit(user.id, "SECURITY_SETTINGS_UPDATED", null, { preferred_otp_method: method });
  response.json({ ok: true, preferred_otp_method: method });
});

router.post("/auth/logout-all", requireAuth, async (_request, response) => {
  const user = authUser(response);
  await audit(user.id, "LOGOUT_ALL_DEVICES", null, {});
  response.clearCookie(cookieName, cookieBaseOptions).json({ ok: true });
});

router.post("/auth/resend-email-otp", async (request, response) => {
  if (!takeRateLimit(`resend:${request.ip}`, 5, 15 * 60 * 1000)) { response.status(429).json({ detail: "Too many resend requests. Please try again later." }); return; }
  const email = validEmail(request.body.email);
  if (!email) { response.status(400).json({ detail: "Enter a valid email address." }); return; }
  const client = await pool.connect();
  const otp = createOtp();
  const otpHash = await hashPassword(otp);
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT id, otp_last_sent_at FROM public.pending_registrations WHERE lower(email) = $1 FOR UPDATE", [email]);
    const pending = result.rows[0];
    if (!pending) { await client.query("ROLLBACK"); response.status(202).json({ ok: true, resendAvailableIn: 60 }); return; }
    const lastSentAt = pending.otp_last_sent_at ? new Date(pending.otp_last_sent_at).getTime() : 0;
    const remaining = OTP_RESEND_COOLDOWN_MS - (Date.now() - lastSentAt);
    if (remaining > 0) { await client.query("ROLLBACK"); response.status(429).json({ detail: "Please wait before requesting another code.", resendAvailableIn: Math.ceil(remaining / 1000) }); return; }
    await client.query("UPDATE public.pending_registrations SET otp_hash = $1, otp_expires_at = now() + interval '10 minutes', otp_attempts = 0, otp_last_sent_at = now() WHERE id = $2", [otpHash, pending.id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); request.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "OTP resend preparation failed"); response.status(500).json({ detail: "Verification code could not be sent." }); return; } finally { client.release(); }
  try {
    await sendVerificationEmail(email, otp);
  } catch (error) {
    await pool.query("DELETE FROM public.pending_registrations WHERE lower(email) = $1", [email]);
    request.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Verification email delivery failed");
    response.status(503).json({ detail: "We could not send the verification email. Please try again later." });
    return;
  }
  response.status(202).json({ ok: true, resendAvailableIn: 60 });
});

router.post("/auth/login", async (request, response) => {
  if (!takeRateLimit(`login:${request.ip}`, 20, 15 * 60 * 1000)) { response.status(429).json({ detail: "Too many sign-in attempts. Please try again later." }); return; }
  const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const password = typeof request.body.password === "string" ? request.body.password : "";
  if (!email || !password) { response.status(400).json({ detail: "Enter your email address and password." }); return; }
  const result = await pool.query("SELECT id, name, email, role, password_hash, email_verified, phone_verified, account_status FROM public.profiles WHERE lower(email) = $1 AND role IN ('FARMER', 'BUYER', 'CONSUMER', 'DRIVER', 'ADMIN')", [email]);
  const row = result.rows[0];
  if (!row || typeof row.password_hash !== "string" || !(await verifyPassword(password, row.password_hash))) { response.status(401).json({ detail: "Invalid email or password." }); return; }
  if (row.account_status !== "ACTIVE") { response.status(403).json({ detail: "This account has been deactivated or suspended.", code: "ACCOUNT_INACTIVE" }); return; }
  if (!row.email_verified && !row.phone_verified) { response.status(403).json({ detail: "Verify your email or mobile before signing in.", code: "EMAIL_NOT_VERIFIED" }); return; }
  const user = { id: row.id, name: row.name, email: row.email, role: row.role as AppRole };
  response.cookie(cookieName, issueToken(user), cookieOptions).json({ user });
});

router.post("/auth/admin-login", async (request, response) => {
  if (!takeRateLimit(`admin-login:${request.ip}`, 20, 15 * 60 * 1000)) {
    response.status(429).json({ detail: "Too many admin sign-in attempts. Try again later.", code: "RATE_LIMITED" });
    return;
  }
  const username = typeof request.body.username === "string" ? request.body.username.trim() : "";
  const password = typeof request.body.password === "string" ? request.body.password : "";
  const configuredUsername = (process.env.ADMIN_USERNAME ?? "admin").trim();
  const configuredPassword = process.env.ADMIN_PASSWORD ?? "admin0";
  if (!configuredUsername || !configuredPassword || username !== configuredUsername || password !== configuredPassword) {
    response.status(401).json({ detail: "Invalid administrator credentials.", code: "INVALID_ADMIN_CREDENTIALS" });
    return;
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || `${configuredUsername}@farm2fork.local`;
  try {
    const existingRes = await pool.query(
      "SELECT id, name, email, role FROM public.profiles WHERE role = 'ADMIN' AND lower(email) = $1 LIMIT 1",
      [email]
    );
    let user = existingRes.rows[0];
    if (!user) {
      const passwordHash = await hashPassword(configuredPassword);
      const inserted = await pool.query(
        "INSERT INTO public.profiles (id, name, email, password_hash, role, email_verified, email_verified_at, account_status) VALUES ($1, $2, $3, $4, 'ADMIN', true, now(), 'ACTIVE') RETURNING id, name, email, role",
        [randomUUID(), "Farm2Fork Administrator", email, passwordHash]
      );
      user = inserted.rows[0];
    }
    void audit(user.id, "ADMIN_LOGIN", username, { role: "ADMIN" }).catch((e) => {
      request.log.warn({ err: e }, "Admin login audit logging failed");
    });
    response.cookie(cookieName, issueToken(user), cookieOptions).json({
      user: { id: user.id, name: user.name, email: user.email, role: "ADMIN" },
    });
  } catch (error) {
    request.log.error({ err: error, message: error instanceof Error ? error.message : String(error) }, "Admin bootstrap failed");
    response.status(503).json({ detail: "Administrator sign-in is unavailable.", code: "ADMIN_AUTH_UNAVAILABLE" });
  }
});

router.post("/auth/logout", (_request, response) => { response.clearCookie(cookieName, cookieBaseOptions).json({ ok: true }); });
router.get("/auth/me", requireAuth, (_request, response) => { const user = authUser(response); response.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } }); });

export default router;
