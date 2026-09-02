import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export type AuthRole = "FARMER" | "BUYER" | "ADMIN";
export type AppRole = "farmer" | "buyer" | "admin";

export type Profile = {
  id: string;
  email: string | null;
  role: AuthRole;
  farmer_id?: string | null;
  buyer_id?: string | null;
};

export type RegistrationInput = {
  name: string;
  email: string;
  password: string;
  mobile: string;
  location: string;
  role: Exclude<AuthRole, "ADMIN">;
  farm_name?: string;
  business_name?: string;
};

type SupabaseUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

type SupabaseSessionPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: SupabaseUser;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: SupabaseUser;
};

export class AuthRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
  }
}

export const supabaseEmailRateLimitMessage =
  "Too many verification emails were requested. Please wait before trying again.";

export function isSupabaseEmailRateLimitError(error: unknown): boolean {
  if (!(error instanceof AuthRequestError)) return false;
  const normalizedMessage = error.message.toLowerCase();
  return (
    error.status === 429 ||
    normalizedMessage.includes("email rate limit") ||
    normalizedMessage.includes("rate limit exceeded") ||
    normalizedMessage.includes("over_email_send_rate_limit")
  );
}

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?.trim()
  .replace(/\/+$/, "");
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabaseConfigurationError = isSupabaseConfigured
  ? null
  : "Supabase Auth is not configured for this environment.";

const sessionStorageKey = "farm2fork.supabase.session";
const pendingProfileStorageKey = "farm2fork.pending-profile";

function frontendUrl(path: string): string {
  const basePath = (import.meta.env.BASE_URL as string | undefined) ?? "/";
  const normalizedBasePath = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  return new URL(
    `${normalizedBasePath}${normalizedPath}`,
    window.location.origin,
  ).toString();
}

function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(sessionStorageKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<AuthSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      !parsed.user ||
      typeof parsed.user.id !== "string"
    ) {
      return null;
    }
    return parsed as AuthSession;
  } catch {
    return null;
  }
}

function saveSession(session: AuthSession | null): void {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(sessionStorageKey);
    return;
  }
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

function toSession(payload: SupabaseSessionPayload): AuthSession | null {
  if (
    typeof payload.access_token !== "string" ||
    typeof payload.refresh_token !== "string" ||
    !payload.user ||
    typeof payload.user.id !== "string"
  ) {
    return null;
  }

  const expiresAt =
    typeof payload.expires_at === "number"
      ? payload.expires_at
      : Math.floor(Date.now() / 1000) + (payload.expires_in ?? 3600);

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt,
    user: payload.user,
  };
}

function pendingProfile(): Omit<RegistrationInput, "password" | "email"> | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.sessionStorage.getItem(pendingProfileStorageKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<
      Omit<RegistrationInput, "password" | "email">
    >;
    if (
      typeof parsed.name !== "string" ||
      typeof parsed.mobile !== "string" ||
      typeof parsed.location !== "string" ||
      (parsed.role !== "FARMER" && parsed.role !== "BUYER")
    ) {
      return null;
    }
    return parsed as Omit<RegistrationInput, "password" | "email">;
  } catch {
    return null;
  }
}

function profileFromUserMetadata(
  user: SupabaseUser,
): Omit<RegistrationInput, "password" | "email"> | null {
  const metadata = user.user_metadata ?? {};
  const role = metadata.role;
  if (
    typeof metadata.name !== "string" ||
    typeof metadata.mobile !== "string" ||
    typeof metadata.location !== "string" ||
    (role !== "FARMER" && role !== "BUYER")
  ) {
    return null;
  }

  const organizationName =
    role === "FARMER" ? metadata.farm_name : metadata.business_name;
  if (typeof organizationName !== "string" || !organizationName.trim()) {
    return null;
  }

  return {
    name: metadata.name.trim(),
    mobile: metadata.mobile.trim(),
    location: metadata.location.trim(),
    role,
    ...(role === "FARMER"
      ? { farm_name: organizationName.trim() }
      : { business_name: organizationName.trim() }),
  };
}

function savePendingProfile(
  profile: Omit<RegistrationInput, "password" | "email">,
): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    pendingProfileStorageKey,
    JSON.stringify(profile),
  );
}

function clearPendingProfile(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(pendingProfileStorageKey);
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error && value.message ? value.message : fallback;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (!payload || typeof payload !== "object") return fallback;

  const record = payload as Record<string, unknown>;
  for (const key of ["msg", "message", "error_description", "detail", "error"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key];
    }
  }
  return fallback;
}

class SupabaseAuthClient {
  private session: AuthSession | null = getStoredSession();
  private refreshPromise: Promise<AuthSession | null> | null = null;

  private ensureConfigured(): void {
    if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) {
      throw new Error(supabaseConfigurationError ?? "Supabase Auth is unavailable.");
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    token?: string,
  ): Promise<T> {
    this.ensureConfigured();
    const headers = new Headers(init.headers);
    headers.set("apikey", supabaseAnonKey!);
    headers.set("content-type", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);

    const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
      ...init,
      headers,
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new AuthRequestError(
        messageFromPayload(payload, "Supabase Auth request failed."),
        response.status,
      );
    }
    return payload as T;
  }

  private setSession(session: AuthSession | null): AuthSession | null {
    this.session = session;
    saveSession(session);
    return session;
  }

  async getSession(): Promise<AuthSession | null> {
    if (!this.session) this.session = getStoredSession();
    if (!this.session) return null;

    const isUsable = this.session.expiresAt > Math.floor(Date.now() / 1000) + 30;
    if (isUsable) return this.session;

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshSession(this.session.refreshToken).finally(
        () => {
          this.refreshPromise = null;
        },
      );
    }
    return this.refreshPromise;
  }

  private async refreshSession(
    refreshToken: string,
  ): Promise<AuthSession | null> {
    try {
      const payload = await this.request<SupabaseSessionPayload>(
        "token?grant_type=refresh_token",
        {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
      );
      const nextSession = toSession(payload);
      return this.setSession(nextSession);
    } catch {
      this.setSession(null);
      return null;
    }
  }

  async getAccessToken(): Promise<string | null> {
    return (await this.getSession())?.accessToken ?? null;
  }

  async restoreRecoverySession(): Promise<AuthSession | null> {
    if (typeof window === "undefined") return null;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (hash.get("type") !== "recovery" || !accessToken || !refreshToken) {
      return null;
    }

    try {
      const user = await this.request<SupabaseUser>("user", {}, accessToken);
      const session = this.setSession({
        accessToken,
        refreshToken,
        expiresAt:
          Math.floor(Date.now() / 1000) +
          Number(hash.get("expires_in") ?? 3600),
        user,
      });
      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${window.location.search}`,
      );
      return session;
    } catch {
      this.setSession(null);
      return null;
    }
  }

  async signUp(input: RegistrationInput): Promise<AuthSession | null> {
    const payload = await this.request<SupabaseSessionPayload>("signup", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        data: {
          name: input.name,
          role: input.role,
          mobile: input.mobile,
          location: input.location,
          farm_name: input.farm_name,
          business_name: input.business_name,
        },
        redirect_to: frontendUrl("login"),
      }),
    });
    const nextSession = toSession(payload);
    this.setSession(nextSession);
    return nextSession;
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const payload = await this.request<SupabaseSessionPayload>(
      "token?grant_type=password",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    const nextSession = toSession(payload);
    if (!nextSession) {
      throw new Error("Supabase Auth did not return a usable session.");
    }
    this.setSession(nextSession);
    return nextSession;
  }

  async signOut(): Promise<void> {
    const currentSession = await this.getSession();
    this.setSession(null);
    if (!currentSession) return;
    try {
      await this.request("logout", { method: "POST" }, currentSession.accessToken);
    } catch {
      // Local session state is already cleared; a revoked/expired token is logged out.
    }
  }

  async resetPassword(email: string): Promise<void> {
    await this.request("recover", {
      method: "POST",
      body: JSON.stringify({
        email,
        redirect_to: frontendUrl("reset-password"),
      }),
    });
  }

  async updatePassword(password: string): Promise<void> {
    const currentSession = await this.getSession();
    if (!currentSession) {
      throw new Error("Your recovery link has expired. Please request a new one.");
    }
    await this.request(
      "user",
      {
        method: "PUT",
        body: JSON.stringify({ password }),
      },
      currentSession.accessToken,
    );
  }

  async apiRequest<T>(
    path: string,
    init: RequestInit = {},
    token: string,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("content-type", "application/json");

    const response = await fetch(path, { ...init, headers });
    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new AuthRequestError(
        messageFromPayload(payload, "Farm2Fork identity request failed."),
        response.status,
      );
    }
    return payload as T;
  }
}

const authClient = new SupabaseAuthClient();

type AuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  session: AuthSession | null;
  profile: Profile | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<Profile>;
  signUp: (
    input: RegistrationInput,
  ) => Promise<{ role: Exclude<AuthRole, "ADMIN">; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  appRole: AppRole | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toAppRole(role: AuthRole): AppRole {
  return role.toLowerCase() as AppRole;
}

function profilePayload(input: RegistrationInput): Omit<
  RegistrationInput,
  "password" | "email"
> {
  return {
    name: input.name,
    mobile: input.mobile,
    location: input.location,
    role: input.role,
    ...(input.farm_name ? { farm_name: input.farm_name } : {}),
    ...(input.business_name ? { business_name: input.business_name } : {}),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(supabaseConfigurationError);

  const loadProfile = useCallback(
    async (nextSession: AuthSession): Promise<Profile> => {
      try {
        return await authClient.apiRequest<Profile>(
          "/api/auth/me",
          { method: "GET" },
          nextSession.accessToken,
        );
      } catch (requestError) {
        if (!(requestError instanceof AuthRequestError) || requestError.status !== 404) {
          throw requestError;
        }

        const pending =
          pendingProfile() ?? profileFromUserMetadata(nextSession.user);
        if (!pending) {
          throw new Error(
            "Your account is authenticated, but its Farm2Fork profile is missing.",
          );
        }

        const created = await authClient.apiRequest<Profile>(
          "/api/auth/profile",
          {
            method: "POST",
            body: JSON.stringify(pending),
          },
          nextSession.accessToken,
        );
        clearPendingProfile();
        return created;
      }
    },
    [],
  );

  useEffect(() => {
    setAuthTokenGetter(() => authClient.getAccessToken());
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return () => setAuthTokenGetter(null);
    }

    let active = true;
    void (async () => {
      try {
        const nextSession =
          (await authClient.restoreRecoverySession()) ??
          (await authClient.getSession());
        if (!active) return;
        setSession(nextSession);
        if (nextSession) {
          const nextProfile = await loadProfile(nextSession);
          if (!active) return;
          setProfile(nextProfile);
          setError(null);
        } else {
          setError(null);
        }
      } catch (loadError) {
        if (!active) return;
        await authClient.signOut();
        setSession(null);
        setProfile(null);
        setError(errorMessage(loadError, "Could not restore your Farm2Fork session."));
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    const onStorage = (event: StorageEvent) => {
      if (event.key !== sessionStorageKey) return;
      const stored = getStoredSession();
      setSession(stored);
      if (!stored) setProfile(null);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      setAuthTokenGetter(null);
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const nextSession = await authClient.signIn(email.trim(), password);
      try {
        const nextProfile = await loadProfile(nextSession);
        setSession(nextSession);
        setProfile(nextProfile);
        return nextProfile;
      } catch (signInError) {
        await authClient.signOut();
        setSession(null);
        setProfile(null);
        throw signInError;
      }
    },
    [loadProfile],
  );

  const signUp = useCallback(async (input: RegistrationInput) => {
    setError(null);
    const nextSession = await authClient.signUp(input);
    savePendingProfile(profilePayload(input));
    if (!nextSession) {
      return {
        role: input.role,
        needsEmailConfirmation: true,
      };
    }

    try {
      const nextProfile = await authClient.apiRequest<Profile>(
        "/api/auth/profile",
        {
          method: "POST",
          body: JSON.stringify(profilePayload(input)),
        },
        nextSession.accessToken,
      );
      clearPendingProfile();
      setSession(nextSession);
      setProfile(nextProfile);
      return {
        role: input.role,
        needsEmailConfirmation: false,
      };
    } catch (signUpError) {
      await authClient.signOut();
      setSession(null);
      setProfile(null);
      throw signUpError;
    }
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    clearPendingProfile();
    setSession(null);
    setProfile(null);
    setError(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await authClient.resetPassword(email.trim());
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    await authClient.updatePassword(password);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isAuthenticated: Boolean(session && profile),
      session,
      profile,
      error,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      appRole: profile ? toAppRole(profile.role) : null,
    }),
    [
      error,
      isLoading,
      profile,
      resetPassword,
      session,
      signIn,
      signOut,
      signUp,
      updatePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}