import { customFetch } from "@workspace/api-client-react";

export type MarketPriceRecord = {
  commodity: string;
  /** Official data.gov.in variety; blank source values are normalized to "Not specified". */
  variety: string;
  grade: string | null;
  state: string | null;
  district: string | null;
  market: string | null;
  arrival_date: string | null;
  min_price: number | null;
  max_price: number | null;
  modal_price: number | null;
  unit: string | null;
  source: string;
  fetched_at: string;
};

export type MarketPricesResponse = {
  records: MarketPriceRecord[];
  total: number | null;
  limit: number;
  offset: number;
  source: string;
  fetched_at: string;
  stale: boolean;
};

export type MarketPriceFilters = {
  commodity?: string;
  variety?: string;
  state?: string;
  district?: string;
  market?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
};

export function getMarketPrices(
  filters: MarketPriceFilters,
  options?: RequestInit,
): Promise<MarketPricesResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return customFetch<MarketPricesResponse>(`/api/market/prices?${params.toString()}`, {
    ...options,
    responseType: "json",
  });
}
