import {
  customFetch,
  type FarmerListing,
} from "@workspace/api-client-react";
import { apiUrl } from "@/lib/api-url";

export async function uploadFarmerListingImage(
  listingId: string,
  file: File,
): Promise<FarmerListing> {
  const formData = new FormData();
  formData.append("file", file);
  return customFetch<FarmerListing>(
    apiUrl(`/api/farmer/listings/${listingId}/image`),
    {
      method: "POST",
      body: formData,
    },
  );
}

export async function uploadFarmerListingMedia(
  listingId: string,
  file: File,
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  await customFetch<void>(apiUrl(`/api/farmer/listings/${listingId}/media`), {
    method: "POST",
    body: formData,
  });
}

export async function deleteFarmerListing(listingId: string): Promise<void> {
  await customFetch<void>(apiUrl(`/api/farmer/listings/${listingId}`), {
    method: "DELETE",
  });
}

export function farmerListingError(
  error: unknown,
  fallback: string,
): string {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;

  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "Only farmer accounts can manage crop listings.";
  if (status === 404) return "That crop listing could not be found.";
  if (status === 413) return "Crop images must be 5 MB or smaller.";
  if (status === 429) return "Too many requests. Please wait and try again.";
  if (status === 409) return "This listing cannot be deleted because it has order history.";
  if (status && status >= 500) {
    return "The crop listing service is temporarily unavailable.";
  }
  return fallback;
}
