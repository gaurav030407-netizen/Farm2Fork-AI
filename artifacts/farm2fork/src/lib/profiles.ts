import { customFetch } from "@workspace/api-client-react";

export type Verification = { status: "NOT_SUBMITTED" | "PENDING" | "VERIFIED" | "REJECTED" | "FAILED"; masked_identifier?: string | null; verified_at?: string | null };
export type UserProfile = {
  id: string; name: string; email?: string | null; role: "FARMER" | "BUYER" | "CONSUMER" | "DRIVER" | "ADMIN"; email_verified: boolean; email_verified_at?: string | null; phone_verified?: boolean; phone_verified_at?: string | null;
  profile_photo_url?: string | null; mobile?: string | null; city?: string | null; state?: string | null; location?: string | null; bio?: string | null; address?: string | null; locality?: string | null; landmark?: string | null; pin_code?: string | null; latitude?: number | null; longitude?: number | null;
  farm_name?: string | null; farm_location?: string | null; crops_grown?: string | null; farming_experience?: string | null; farm_description?: string | null; farm_size?: number | null; farm_size_unit?: string | null; farming_type?: string | null;
  business_name?: string | null; buyer_type?: string | null; purchasing_interests?: string | null; preferred_crops?: string | null; business_location?: string | null; delivery_address?: string | null;
  service_area?: string | null; vehicle_type?: string | null; vehicle_registration?: string | null; availability_status?: string | null; approval_status?: string | null;
  preferred_otp_method?: "EMAIL" | "SMS" | null;
  completion_percent: number; pan_verification: Verification; created_at: string;
};

export const profilesApi = {
  getMe: () => customFetch<UserProfile>("/api/profile/me", { responseType: "json" }),
  getPublic: (userId: string) => customFetch<UserProfile>(`/api/profile/${encodeURIComponent(userId)}`, { responseType: "json" }),
  update: (data: Partial<UserProfile>) => customFetch<UserProfile>("/api/profile/me", { method: "PATCH", responseType: "json", body: JSON.stringify(data) }),
  uploadPhoto: (file: File) => { const body = new FormData(); body.append("file", file); return customFetch<UserProfile>("/api/profile/me/photo", { method: "POST", responseType: "json", body }); },
  reverseGeocode: (latitude: number, longitude: number, signal?: AbortSignal) => customFetch<ReverseGeocodeResult>(`/api/profile/reverse-geocode?latitude=${latitude}&longitude=${longitude}`, { responseType: "json", signal }),
};

export type ReverseGeocodeResult = {
  success?: boolean;
  latitude?: number;
  longitude?: number;
  display_name?: string;
  address?: string;
  locality?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  country?: string;
  raw_address?: Record<string, string>;
  nominatim_display_name?: string;
  nominatim_address?: { road?: string; neighbourhood?: string; suburb?: string; village?: string; town?: string; city?: string; municipality?: string; county?: string; state?: string; postcode?: string; country?: string };
};