import { useEffect, useState } from "react";
import { CheckCircle2, MapPin, Truck, Filter, RotateCcw } from "lucide-react";
import { apiUrl } from "@/lib/api-url";
import { Feedback, LoadingButton, QueryState, SectionTitle, Button } from "@/components/ui-kit";
import { INDIAN_STATES, getDistrictsForState } from "@/lib/indian-locations";

type Job = {
  id: string;
  order_id: string;
  status: string;
  pickup_location: string;
  delivery_location: string;
  estimated_distance_km: number | null;
  farmer_name: string | null;
  buyer_name: string | null;
  quantity_summary: string | null;
};

type Earning = {
  id: string;
  amount: number;
  status: "ELIGIBLE" | "PAID";
  order_id: string;
  delivered_at: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail ?? "Driver service request failed.");
  return payload as T;
}

export function DriverDashboard() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [active, setActive] = useState<Job[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);

  // Regional discovery filters
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const districts = selectedState ? getDistrictsForState(selectedState) : [];

  const load = async () => {
    try {
      const [available, current, history] = await Promise.all([
        request<Job[]>("/api/drivers/jobs"),
        request<Job[]>("/api/drivers/jobs/active"),
        request<Earning[]>("/api/drivers/earnings"),
      ]);
      setJobs(available);
      setActive(current);
      setEarnings(history);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not load delivery jobs.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const accept = async (id: string) => {
    setPending(id);
    setFeedback("");
    try {
      await request(`/api/drivers/jobs/${id}/accept`, { method: "POST", body: "{}" });
      await load();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not accept this job.");
    } finally {
      setPending(null);
    }
  };

  const visibleJobs = (jobs ?? []).filter((job) => {
    const locLower = (job.pickup_location ?? "").toLowerCase();
    const matchesState = !selectedState || locLower.includes(selectedState.toLowerCase());
    const matchesDistrict = !selectedDistrict || locLower.includes(selectedDistrict.toLowerCase());
    return matchesState && matchesDistrict;
  });

  return (
    <div className="space-y-7">
      <SectionTitle
        eyebrow="Driver workspace"
        title="Move produce with confidence"
        detail="Discover local pickup routes, accept transport jobs, and verify delivery handoffs."
      />
      {feedback && <Feedback message={feedback} kind="error" />}

      {/* Driver Stats / Earnings */}
      <div id="earnings" className="scroll-mt-20 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Active delivery</div>
          <div className="mt-2 font-display text-3xl font-bold">{active.length}</div>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Eligible earnings</div>
          <div className="mt-2 font-display text-3xl font-bold">
            ₹{earnings.filter((item) => item.status === "ELIGIBLE").reduce((total, item) => total + Number(item.amount), 0).toLocaleString("en-IN")}
          </div>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Paid earnings</div>
          <div className="mt-2 font-display text-3xl font-bold">
            ₹{earnings.filter((item) => item.status === "PAID").reduce((total, item) => total + Number(item.amount), 0).toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* Active In-Transit Delivery */}
      <div id="active" className="scroll-mt-20">
        {active.length > 0 ? (
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <h2 className="font-display text-2xl font-bold">Active delivery</h2>
            <div className="mt-4 space-y-3">
              {active.map((job) => (
                <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[hsl(var(--muted)/.5)] p-4 text-sm">
                  <div>
                    <div className="font-bold">{job.quantity_summary ?? "Produce order"}</div>
                    <div className="mt-1 text-[hsl(var(--muted-foreground))]">
                      {job.pickup_location} to {job.delivery_location}
                    </div>
                    {job.buyer_name && (
                      <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                        Recipient: {job.buyer_name} (Bulk Buyer / Consumer)
                      </div>
                    )}
                  </div>
                  <span className="rounded-full bg-[hsl(var(--accent)/.2)] px-3 py-1 text-xs font-bold">
                    {job.status.replaceAll("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-sm text-[hsl(var(--muted-foreground))]">
            <span className="font-bold text-[hsl(var(--foreground))]">Active Delivery:</span> No orders currently in transit. Accept a pickup below to begin dispatch.
          </div>
        )}
      </div>

      {/* Regional Job Discovery Filters & Nearby Pickups */}
      <div id="pickups" className="scroll-mt-20 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[hsl(var(--foreground))]">
            <Filter size={15} className="text-[hsl(var(--primary))]" />
            Regional Route Filter
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedState}
              onChange={(e) => {
                setSelectedState(e.target.value);
                setSelectedDistrict("");
              }}
              className="min-h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 text-xs outline-none focus:border-[hsl(var(--primary))]"
            >
              <option value="">All States & UTs</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              disabled={!selectedState}
              className="min-h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 text-xs outline-none focus:border-[hsl(var(--primary))] disabled:opacity-50"
            >
              <option value="">{selectedState ? "All Districts" : "Select State First"}</option>
              {districts.map((district) => (
                <option key={district} value={district}>{district}</option>
              ))}
            </select>
            {(selectedState || selectedDistrict) && (
              <Button
                variant="ghost"
                className="h-9 px-2 text-xs"
                onClick={() => {
                  setSelectedState("");
                  setSelectedDistrict("");
                }}
              >
                <RotateCcw size={12} className="mr-1" /> Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Available Jobs */}
      {jobs === null ? (
        <QueryState loading error={false}> </QueryState>
      ) : visibleJobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-10 text-center">
          <Truck className="mx-auto text-[hsl(var(--primary))]" size={30} />
          <p className="mt-3 font-bold">
            {selectedState || selectedDistrict ? "No pickup jobs matching this region." : "No delivery jobs are available right now."}
          </p>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {selectedState || selectedDistrict ? "Try selecting a nearby state or clearing region filters." : "Keep your availability on when you are ready for the next pickup."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleJobs.map((job) => (
            <article key={job.id} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Available delivery</div>
                  <h2 className="mt-1 font-display text-xl font-bold">{job.quantity_summary ?? "Produce order"}</h2>
                  {job.buyer_name && (
                    <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                      Destination Client: {job.buyer_name} (Bulk Buyer / Consumer)
                    </div>
                  )}
                </div>
                <span className="rounded-full bg-[hsl(var(--accent)/.2)] px-3 py-1 text-xs font-bold">
                  {job.estimated_distance_km ? `${job.estimated_distance_km} km` : "Route pending"}
                </span>
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex gap-3">
                  <MapPin size={17} className="mt-0.5 text-[hsl(var(--primary))]" />
                  <span><strong>Pickup:</strong> {job.pickup_location}</span>
                </div>
                <div className="flex gap-3">
                  <MapPin size={17} className="mt-0.5 text-[hsl(var(--accent-foreground))]" />
                  <span><strong>Deliver:</strong> {job.delivery_location}</span>
                </div>
              </div>
              <LoadingButton pending={pending === job.id} onClick={() => void accept(job.id)} className="mt-5 w-full">
                Accept delivery
              </LoadingButton>
            </article>
          ))}
        </div>
      )}

      <div id="history" className="scroll-mt-20 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.45)] p-5 text-sm">
        <div className="flex items-center gap-2 font-bold">
          <CheckCircle2 size={17} className="text-[hsl(var(--primary))]" /> Delivery History & Verified Handoffs
        </div>
        <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          {earnings.filter((item) => item.status === "PAID").length > 0 ? (
            <p>Completed deliveries ({earnings.filter((item) => item.status === "PAID").length}) recorded with server-verified handover OTPs.</p>
          ) : (
            <p>Pickup and delivery are confirmed by expiring server-generated codes. Completed dispatch runs will appear in your verified delivery history.</p>
          )}
        </div>
      </div>
    </div>
  );
}
