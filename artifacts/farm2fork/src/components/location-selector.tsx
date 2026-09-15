import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { MapPin, Navigation, X } from "lucide-react";
import { Button, Feedback } from "@/components/ui-kit";
import { profilesApi, type ReverseGeocodeResult } from "@/lib/profiles";
import { StateDistrictSelector } from "@/components/state-district-selector";
import { normalizeDistrictName, normalizeStateName } from "@/lib/indian-locations";
import "leaflet/dist/leaflet.css";

type LocationValues = {
  address: string;
  locality: string;
  landmark: string;
  city: string;
  state: string;
  pin_code: string;
  latitude: string;
  longitude: string;
};
type Coordinates = { latitude: number; longitude: number };

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

function MapClickHandler({ onPick }: { onPick: (coordinates: Coordinates) => void }) {
  useMapEvents({ click: ({ latlng }) => onPick({ latitude: latlng.lat, longitude: latlng.lng }) });
  return null;
}

function MapCenter({ coordinates }: { coordinates: Coordinates | null }) {
  const map = useMap();
  useEffect(() => {
    if (coordinates) map.flyTo([coordinates.latitude, coordinates.longitude], Math.max(map.getZoom(), 13));
  }, [coordinates, map]);
  return null;
}

function addressFields(result: ReverseGeocodeResult, coordinates: Coordinates): Partial<LocationValues> {
  const matchedState = normalizeStateName(result.state) || "";
  const matchedDistrict = normalizeDistrictName(matchedState, result.city) || "";

  return {
    address: result.address ?? result.display_name ?? "",
    locality: result.locality ?? "",
    landmark: result.landmark ?? "",
    city: matchedDistrict,
    state: matchedState,
    pin_code: result.pin_code ?? "",
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
  };
}

export function LocationSelector({ values, onChange, title }: { values: LocationValues; onChange: (key: keyof LocationValues, value: string) => void; title: string }) {
  const [detecting, setDetecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [pending, setPending] = useState<Coordinates | null>(null);
  const [pendingFields, setPendingFields] = useState<Partial<LocationValues> | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const reverseController = useRef<AbortController | null>(null);
  const currentCoordinates = useMemo(() => values.latitude && values.longitude ? { latitude: Number(values.latitude), longitude: Number(values.longitude) } : null, [values.latitude, values.longitude]);

  const reverse = async (coordinates: Coordinates) => {
    reverseController.current?.abort();
    const controller = new AbortController();
    reverseController.current = controller;
    setMapError(null);
    try {
      const result = await profilesApi.reverseGeocode(coordinates.latitude, coordinates.longitude, controller.signal);
      if (controller.signal.aborted) return;
      setPendingFields(addressFields(result, coordinates));
      setMessage(result.success ? "Address detected. Review the state, district, and address details." : "Location detected. Please review the address details.");
    } catch {
      if (controller.signal.aborted) return;
      setPendingFields({ latitude: String(coordinates.latitude), longitude: String(coordinates.longitude) });
      setMapError("Location detected, but the address could not be retrieved. Please select your State and District manually.");
    }
  };

  useEffect(() => () => reverseController.current?.abort(), []);

  const pick = (coordinates: Coordinates) => { setPending(coordinates); void reverse(coordinates); };
  const confirmPending = () => {
    if (!pendingFields) return;
    Object.entries(pendingFields).forEach(([key, value]) => { if (value !== undefined) onChange(key as keyof LocationValues, value); });
    setMessage("Location selected. Review the address and save your profile to confirm it.");
    setMapOpen(false); setPending(null); setPendingFields(null);
  };
  const detect = () => {
    if (!navigator.geolocation) { setMessage("Location detection is not supported in this browser. Please select your State and District below."); return; }
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") { setMessage("Location detection requires a secure connection. Please select your State and District below."); return; }
    setDetecting(true); setMessage(null);
    navigator.geolocation.getCurrentPosition(async (position) => {
      const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setDetecting(false); setMapOpen(true); setPending(coordinates); await reverse(coordinates);
    }, (error) => {
      setDetecting(false);
      setMessage(error.code === error.PERMISSION_DENIED ? "Location permission was denied. Please select your State and District below." : error.code === error.TIMEOUT ? "Location detection timed out. Please select your State and District below." : "Location is unavailable right now. Please select your State and District below.");
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  };

  return <section className="space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
    <div>
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
        Select your State and District from the official lists. You can also pick a point on the map or use your current location. Nothing is saved until you save your profile.
      </p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" onClick={detect} disabled={detecting}>
        <Navigation size={15} />{detecting ? "Detecting..." : "Use my current location"}
      </Button>
      <Button type="button" variant="secondary" onClick={() => { setMapError(null); setPending(currentCoordinates); setPendingFields(currentCoordinates ? { latitude: String(currentCoordinates.latitude), longitude: String(currentCoordinates.longitude) } : null); setMapOpen(true); }}>
        <MapPin size={15} />Pick on map
      </Button>
    </div>
    {message && <Feedback message={message} kind="success" />}
    {mapError && !mapOpen && <Feedback message={mapError} kind="error" />}

    {/* Cascading State -> District Dropdowns (No manual text entry) */}
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.3)] p-4">
      <StateDistrictSelector
        selectedState={values.state}
        selectedDistrict={values.city}
        onStateChange={(nextState) => {
          onChange("state", nextState);
          onChange("city", "");
        }}
        onDistrictChange={(nextDistrict) => {
          onChange("city", nextDistrict);
        }}
        stateLabel="State / Union Territory"
        districtLabel="District / City"
        required
      />
    </div>

    {/* Remaining structured address fields */}
    <div className="grid gap-4 sm:grid-cols-2">
      {(["address", "locality", "landmark", "pin_code"] as const).map((key) => (
        <label key={key} className="text-sm font-semibold">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {key.replaceAll("_", " ")}
          </span>
          <input
            value={values[key]}
            onChange={(event) => onChange(key, event.target.value)}
            placeholder={key === "pin_code" ? "6-digit PIN code" : key === "address" ? "House / Road / Farm gate address" : ""}
            inputMode={key === "pin_code" ? "numeric" : undefined}
            className="min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm"
          />
        </label>
      ))}
    </div>

    {values.latitude && values.longitude && (
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Saved coordinates: {Number(values.latitude).toFixed(5)}, {Number(values.longitude).toFixed(5)}
      </p>
    )}

    {mapOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--foreground)/.55)] p-4">
        <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4">
            <div>
              <h3 className="font-bold">Select {title.toLowerCase()}</h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Click or tap the map to move the marker.</p>
            </div>
            <button type="button" onClick={() => { setMapOpen(false); setPending(null); setPendingFields(null); }} className="rounded-lg p-2 hover:bg-[hsl(var(--muted))]" aria-label="Close map"><X size={18} /></button>
          </div>
          <div className="h-[min(55vh,420px)]">
            <MapContainer center={pending ? [pending.latitude, pending.longitude] : DEFAULT_CENTER} zoom={pending ? 13 : 5} scrollWheelZoom className="h-full w-full">
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapClickHandler onPick={pick} />
              <MapCenter coordinates={pending} />
              {pending && <CircleMarker center={[pending.latitude, pending.longitude]} radius={10} pathOptions={{ color: "#146b4b", fillColor: "#f0b94f", fillOpacity: 0.9 }} />}
            </MapContainer>
          </div>
          <div className="space-y-3 p-5">
            {pendingFields?.address && <p className="text-sm font-semibold">{pendingFields.address}</p>}
            {pendingFields?.state && <p className="text-xs text-[hsl(var(--muted-foreground))]">Detected: {pendingFields.city ? `${pendingFields.city}, ` : ''}{pendingFields.state}</p>}
            {mapError && <Feedback message={mapError} kind="error" />}
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{pending ? `Coordinates: ${pending.latitude.toFixed(6)}, ${pending.longitude.toFixed(6)}` : "Select a point to continue."}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => { setMapOpen(false); setPending(null); setPendingFields(null); }}>Cancel</Button>
              <Button type="button" onClick={confirmPending} disabled={!pendingFields}>Use this location</Button>
            </div>
          </div>
        </div>
      </div>
    )}
  </section>;
}
