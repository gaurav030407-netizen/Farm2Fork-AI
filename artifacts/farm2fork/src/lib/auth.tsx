import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-url";

export type AuthRole = "FARMER" | "BUYER" | "CONSUMER" | "DRIVER" | "ADMIN";
export type AppRole = "farmer" | "buyer" | "consumer" | "driver" | "admin";
export type Profile = { id: string; name?: string | null; email: string | null; role: AuthRole; farmer_id?: string | null; buyer_id?: string | null };
export type RegistrationInput = { name: string; email: string; password: string; mobile: string; location: string; role: Exclude<AuthRole, "ADMIN">; otp_method?: "EMAIL" | "SMS"; farm_name?: string; business_name?: string };
export type AuthSession = { user: { id: string; email: string | null } };

export class AuthRequestError extends Error {
  readonly status: number;
  readonly kind: "http" | "timeout" | "network";
  readonly code?: string;
  constructor(message: string, status: number, kind: "http" | "timeout" | "network" = "http", code?: string) { super(message); this.name = "AuthRequestError"; this.status = status; this.kind = kind; this.code = code; }
}

async function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const endpoint = `/api/auth/${path}`;
  const startedAt = performance.now();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("Bypass-Tunnel-Reminder", "true");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  const abortExternal = () => controller.abort();
  init.signal?.addEventListener("abort", abortExternal, { once: true });
  if (init.signal?.aborted) controller.abort();
  const debug = (event: "AUTH_REQUEST_START" | "AUTH_REQUEST_END" | "AUTH_REQUEST_ERROR", details: Record<string, unknown> = {}) => {
    if (import.meta.env.DEV) console.debug(event, { endpoint, durationMs: Math.round(performance.now() - startedAt), ...details });
  };
  debug("AUTH_REQUEST_START");
  let response: Response;
  try {
    response = await fetch(apiUrl(`/api/auth/${path}`), { ...init, headers, credentials: "include", signal: init.signal ?? controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      debug("AUTH_REQUEST_ERROR", { kind: "timeout" });
      throw new AuthRequestError("The authentication service did not respond. Please try again.", 0, "timeout");
    }
    debug("AUTH_REQUEST_ERROR", { kind: "network" });
    throw new AuthRequestError("Unable to reach the authentication service. Please check that the local API is running.", 0, "network");
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortExternal);
  }
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    let detail = "Authentication request failed.";
    let code: string | undefined;

    if (payload && typeof payload === "object") {
      const p = payload as Record<string, unknown>;
      if (typeof p.code === "string") {
        code = p.code;
      }
      if (typeof p.detail === "string" && p.detail.trim()) {
        detail = p.detail.trim();
      } else if (Array.isArray(p.detail) && p.detail.length > 0) {
        detail = p.detail
          .map((item) => (typeof item === "string" ? item : (item as { msg?: string })?.msg || JSON.stringify(item)))
          .filter(Boolean)
          .join("; ");
      } else if (typeof p.error === "string" && p.error.trim()) {
        detail = p.error.trim();
      } else if (typeof p.message === "string" && p.message.trim()) {
        detail = p.message.trim();
      }
    } else if (typeof payload === "string" && payload.trim().length > 0 && !payload.includes("<html") && !payload.includes("<!DOCTYPE")) {
      detail = payload.trim();
    }

    if (detail === "Authentication request failed.") {
      if (response.status >= 500) {
        detail = "The authentication service is currently unavailable. Please verify that the API server is running on port 3000.";
      } else if (response.status === 404) {
        detail = "The authentication service endpoint was not found. Please verify the API server is running.";
      } else if (response.status === 401) {
        detail = "Invalid email or password.";
      } else if (response.status === 403) {
        detail = "Access denied. Please check your account permissions or verification status.";
      }
    }

    debug("AUTH_REQUEST_ERROR", { kind: "http", status: response.status, detail, code });
    throw new AuthRequestError(detail, response.status, "http", code);
  }
  debug("AUTH_REQUEST_END", { status: response.status });
  return payload as T;
}

type AuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  session: AuthSession | null;
  profile: Profile | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<Profile>;
  signInAdmin: (username: string, password: string) => Promise<Profile>;
  signInWithOtp: (method: "EMAIL" | "SMS", identifier: string, otp: string) => Promise<Profile>;
  sendLoginOtp: (method: "EMAIL" | "SMS", identifier: string) => Promise<{ resendAvailableIn: number }>;
  signUp: (input: RegistrationInput) => Promise<{ needsEmailConfirmation: boolean; needsOtpConfirmation: boolean; otpMethod: "EMAIL" | "SMS"; resendAvailableIn: number }>;
  verifyEmail: (email: string, otp: string) => Promise<void>;
  verifyRegistrationOtp: (mobile: string, otp: string) => Promise<void>;
  resendEmailOtp: (email: string) => Promise<{ resendAvailableIn: number }>;
  changeContact: (contactType: "EMAIL" | "PHONE", newValue: string, otp?: string) => Promise<void>;
  deleteAccount: (confirmation: string, credentials: { password?: string; otp?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateSecuritySettings: (preferredOtpMethod: "EMAIL" | "SMS") => Promise<void>;
  logoutAllDevices: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  appRole: AppRole | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
function toAppRole(role: AuthRole): AppRole { return role.toLowerCase() as AppRole; }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signOutInFlight = useRef(false);

  const loadCurrentUser = useCallback(async () => {
    try {
      const result = await authRequest<{ user: Profile }>("me");
      setProfile(result.user);
      setSession({ user: { id: result.user.id, email: result.user.email } });
      setError(null);
    } catch (requestError) {
      if (requestError instanceof AuthRequestError && requestError.status === 401) {
        setSession(null); setProfile(null); setError(null);
      } else setError(requestError instanceof Error ? requestError.message : "Could not restore your session.");
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void loadCurrentUser(); }, [loadCurrentUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const trimmedEmail = email.trim();
    const result = await authRequest<{ user: Profile }>("login", { method: "POST", body: JSON.stringify({ email: trimmedEmail, password }) });
    setProfile(result.user); setSession({ user: { id: result.user.id, email: result.user.email } });
    return result.user;
  }, []);
  const signInAdmin = useCallback(async (username: string, password: string) => {
    const trimmedUsername = username.trim();
    const result = await authRequest<{ user: Profile }>("admin-login", { method: "POST", body: JSON.stringify({ username: trimmedUsername, password }) });
    setProfile(result.user); setSession({ user: { id: result.user.id, email: result.user.email } }); return result.user;
  }, []);
  const sendLoginOtp = useCallback(async (method: "EMAIL" | "SMS", identifier: string) => {
    const trimmedIdentifier = identifier.trim();
    return authRequest<{ resendAvailableIn: number }>("otp/send", { method: "POST", body: JSON.stringify(method === "EMAIL" ? { method, email: trimmedIdentifier } : { method, mobile: trimmedIdentifier }) });
  }, []);
  const signInWithOtp = useCallback(async (method: "EMAIL" | "SMS", identifier: string, otp: string) => {
    const trimmedIdentifier = identifier.trim();
    const trimmedOtp = otp.trim();
    const result = await authRequest<{ user: Profile }>("otp/verify", { method: "POST", body: JSON.stringify(method === "EMAIL" ? { method, email: trimmedIdentifier, otp: trimmedOtp } : { method, mobile: trimmedIdentifier, otp: trimmedOtp }) });
    setProfile(result.user); setSession({ user: { id: result.user.id, email: result.user.email } }); return result.user;
  }, []);

  const signUp = useCallback(async (input: RegistrationInput) => {
    setError(null);
    const result = await authRequest<{ needsEmailConfirmation: boolean; needsOtpConfirmation: boolean; otpMethod: "EMAIL" | "SMS"; resendAvailableIn: number }>("register", { method: "POST", body: JSON.stringify(input) });
    return result;
  }, []);

  const verifyEmail = useCallback(async (email: string, otp: string) => {
    setError(null);
    await authRequest<{ ok: boolean }>("verify-email", { method: "POST", body: JSON.stringify({ email, otp }) });
  }, []);
  const verifyRegistrationOtp = useCallback(async (mobile: string, otp: string) => { setError(null); await authRequest<{ ok: boolean }>("verify-otp", { method: "POST", body: JSON.stringify({ mobile, otp }) }); }, []);

  const resendEmailOtp = useCallback(async (email: string) => {
    setError(null);
    return authRequest<{ resendAvailableIn: number }>("resend-email-otp", { method: "POST", body: JSON.stringify({ email }) });
  }, []);
  const changeContact = useCallback(async (contactType: "EMAIL" | "PHONE", newValue: string, otp?: string) => {
    setError(null);
    const path = otp ? "contact/change/verify" : "contact/change/send";
    await authRequest<{ ok: boolean }>(path, { method: "POST", body: JSON.stringify(otp ? { contact_type: contactType, otp } : { contact_type: contactType, new_value: newValue }) });
  }, []);
  const deleteAccount = useCallback(async (confirmation: string, credentials: { password?: string; otp?: string }) => {
    await authRequest<{ ok: boolean }>("account", { method: "DELETE", body: JSON.stringify({ confirmation, ...credentials }) });
    setSession(null); setProfile(null); setError(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setError(null);
    await authRequest<{ ok: boolean }>("change-password", { method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
  }, []);

  const updateSecuritySettings = useCallback(async (preferredOtpMethod: "EMAIL" | "SMS") => {
    setError(null);
    await authRequest<{ ok: boolean }>("security-settings", { method: "PATCH", body: JSON.stringify({ preferred_otp_method: preferredOtpMethod }) });
  }, []);

  const logoutAllDevices = useCallback(async () => {
    try {
      await authRequest<{ ok: boolean }>("logout-all", { method: "POST" });
    } finally {
      setSession(null);
      setProfile(null);
      setError(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    try {
      await authRequest<{ ok: boolean }>("logout", { method: "POST" });
      setSession(null);
      setProfile(null);
      setError(null);
    } finally {
      signOutInFlight.current = false;
    }
  }, []);
  const resetPassword = useCallback(async (_email: string) => { throw new Error("Password recovery is not available with local account authentication yet."); }, []);
  const updatePassword = useCallback(async (_password: string) => { throw new Error("Password recovery is not available with local account authentication yet."); }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isLoading,
    isAuthenticated: Boolean(session && profile),
    session,
    profile,
    error,
    signIn,
    signInAdmin,
    signInWithOtp,
    sendLoginOtp,
    signUp,
    verifyEmail,
    verifyRegistrationOtp,
    resendEmailOtp,
    changeContact,
    deleteAccount,
    changePassword,
    updateSecuritySettings,
    logoutAllDevices,
    signOut,
    resetPassword,
    updatePassword,
    appRole: profile ? toAppRole(profile.role) : null,
  }), [changeContact, changePassword, deleteAccount, error, isLoading, logoutAllDevices, profile, resendEmailOtp, resetPassword, sendLoginOtp, session, signIn, signInAdmin, signInWithOtp, signOut, signUp, updatePassword, updateSecuritySettings, verifyEmail, verifyRegistrationOtp]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
