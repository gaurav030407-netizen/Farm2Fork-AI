import { useEffect, useState } from "react";

export type WeatherStatus = "IDLE" | "NO_LOCATION" | "LOADING" | "SUCCESS" | "ERROR";

export type WeatherData = {
  status: WeatherStatus;
  temperature: number | null;
  condition: string;
  resolvedLocation: string | null;
  message: string | null;
};

const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

// In-memory cache to prevent excessive queries
const weatherCache = new Map<string, { data: WeatherData; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function useLocationWeather(
  state?: string | null,
  district?: string | null
): WeatherData {
  const [data, setData] = useState<WeatherData>(() => {
    if (!state && !district) {
      return {
        status: "NO_LOCATION",
        temperature: null,
        condition: "",
        resolvedLocation: null,
        message: "Select your location to see local weather.",
      };
    }
    return {
      status: "LOADING",
      temperature: null,
      condition: "",
      resolvedLocation: null,
      message: null,
    };
  });

  useEffect(() => {
    // If no state or district is selected, prompt user to select location
    const trimmedState = state?.trim() || "";
    const trimmedDistrict = district?.trim() || "";

    if (!trimmedState && !trimmedDistrict) {
      setData({
        status: "NO_LOCATION",
        temperature: null,
        condition: "",
        resolvedLocation: null,
        message: "Select your location to see local weather.",
      });
      return;
    }

    const cacheKey = `${trimmedState}__${trimmedDistrict}`.toLowerCase();
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setData(cached.data);
      return;
    }

    let active = true;
    const controller = new AbortController();

    async function fetchWeather() {
      setData((prev) => ({ ...prev, status: "LOADING", message: null }));

      try {
        let lat: number | null = null;
        let lon: number | null = null;
        let resolvedCity = trimmedDistrict || trimmedState;
        let resolvedStateName = trimmedState;

        // Step 1: Geocoding via Open-Meteo
        const searchTerms = [
          trimmedDistrict,
          `${trimmedDistrict} ${trimmedState}`,
          trimmedState,
        ].filter(Boolean);

        for (const term of searchTerms) {
          const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            term
          )}&count=10&language=en&format=json`;

          const geoRes = await fetch(geoUrl, { signal: controller.signal });
          if (!geoRes.ok) continue;

          const geoData = await geoRes.json();
          const results = geoData.results;
          if (!Array.isArray(results) || results.length === 0) continue;

          // Priority 1: Match India and state
          const match =
            results.find(
              (r: any) =>
                r.country_code === "IN" &&
                trimmedState &&
                r.admin1 &&
                r.admin1.toLowerCase().includes(trimmedState.toLowerCase())
            ) ||
            results.find((r: any) => r.country_code === "IN") ||
            results[0];

          if (match && typeof match.latitude === "number" && typeof match.longitude === "number") {
            lat = match.latitude;
            lon = match.longitude;
            resolvedCity = match.name || trimmedDistrict || trimmedState;
            resolvedStateName = match.admin1 || trimmedState;
            break;
          }
        }

        if (lat === null || lon === null) {
          if (active) {
            setData({
              status: "ERROR",
              temperature: null,
              condition: "",
              resolvedLocation: trimmedDistrict ? `${trimmedDistrict}, ${trimmedState}` : trimmedState,
              message: `Weather unavailable for ${trimmedDistrict || trimmedState}.`,
            });
          }
          return;
        }

        // Step 2: Weather forecast from Open-Meteo
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
        const weatherRes = await fetch(weatherUrl, { signal: controller.signal });
        if (!weatherRes.ok) {
          throw new Error("Failed to fetch weather from provider.");
        }

        const weatherPayload = await weatherRes.json();
        const current = weatherPayload.current;
        const temp = typeof current?.temperature_2m === "number" ? Math.round(current.temperature_2m) : null;
        const code = current?.weather_code ?? 0;
        const condition = WEATHER_DESCRIPTIONS[code] || "Partly cloudy";
        const locationLabel = resolvedCity ? `${resolvedCity}, ${resolvedStateName}` : resolvedStateName;

        const resultData: WeatherData = {
          status: "SUCCESS",
          temperature: temp,
          condition,
          resolvedLocation: locationLabel,
          message: null,
        };

        weatherCache.set(cacheKey, { data: resultData, timestamp: Date.now() });

        if (active) {
          setData(resultData);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        if (active) {
          setData({
            status: "ERROR",
            temperature: null,
            condition: "",
            resolvedLocation: trimmedDistrict ? `${trimmedDistrict}, ${trimmedState}` : trimmedState,
            message: "Unable to retrieve weather right now.",
          });
        }
      }
    }

    void fetchWeather();

    return () => {
      active = false;
      controller.abort();
    };
  }, [state, district]);

  return data;
}
