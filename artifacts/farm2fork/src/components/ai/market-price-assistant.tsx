import { type FormEvent, useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  Info,
  Layers,
  Loader2,
  MapPin,
  Minus,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { apiUrl } from '@/lib/api-url';

interface PriceAnalysis {
  crop: string;
  variety: string;
  selected_market: string;
  state: string | null;
  district: string | null;
  latest_modal: number | null;
  modal_unit: string;
  recent_range_min: number | null;
  recent_range_max: number | null;
  recent_median: number | null;
  observations_count: number;
  data_coverage_from: string | null;
  data_coverage_to: string | null;
  trend: 'Rising' | 'Falling' | 'Mixed' | 'Insufficient data';
  confidence: 'High' | 'Medium' | 'Low' | 'Insufficient data';
  asking_price: number | null;
  difference_amount: number | null;
  difference_percentage: number | null;
  difference_summary: string | null;
  market_comparison: Array<{
    market: string;
    location: string;
    avg_modal: number;
    last_date: string | null;
  }>;
  historical_period: string;
  has_sufficient_data: boolean;
  ai_interpretation: string;
  disclaimer: string;
}

interface Props {
  initialCrop?: string;
  initialVariety?: string;
  initialState?: string;
  initialDistrict?: string;
  initialMarket?: string;
  initialAskingPrice?: number;
  onSelectPrice?: (price: number) => void;
}

export function MarketPriceAssistant({
  initialCrop = 'Potato',
  initialVariety = '',
  initialState = '',
  initialDistrict = '',
  initialMarket = '',
  initialAskingPrice,
  onSelectPrice,
}: Props) {
  const [crop, setCrop] = useState(initialCrop);
  const [variety, setVariety] = useState(initialVariety);
  const [state, setState] = useState(initialState);
  const [district, setDistrict] = useState(initialDistrict);
  const [market, setMarket] = useState(initialMarket);
  const [askingPrice, setAskingPrice] = useState<string>(
    initialAskingPrice ? String(initialAskingPrice) : '',
  );
  const [period, setPeriod] = useState<string>('2m');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<PriceAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    if (!crop.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl('/api/ai/price-assistant'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          crop: crop.trim(),
          variety: variety.trim() || null,
          state: state.trim() || null,
          district: district.trim() || null,
          market: market.trim() || null,
          asking_price: askingPrice ? Number(askingPrice) : null,
          period,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        throw new Error(errJson?.detail ?? 'Unable to fetch market price analysis.');
      }

      const data: PriceAnalysis = await response.json();
      setAnalysis(data);
    } catch (err: any) {
      setError(err.message || 'Market price assistant temporarily unavailable.');
    } finally {
      setIsLoading(false);
    }
  };

  // Run initial analysis once on mount if crop is specified
  useEffect(() => {
    if (initialCrop) {
      void runAnalysis();
    }
  }, []);

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runAnalysis();
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'High':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 size={12} /> High Confidence
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <Info size={12} /> Medium Confidence
          </span>
        );
      case 'Low':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
            <Info size={12} /> Low Data Coverage
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <AlertCircle size={12} /> Insufficient Data
          </span>
        );
    }
  };

  const getTrendBadge = (trend: string) => {
    switch (trend) {
      case 'Rising':
        return (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">
            <TrendingUp size={16} /> Rising
          </span>
        );
      case 'Falling':
        return (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-rose-700 dark:text-rose-400">
            <TrendingDown size={16} /> Falling
          </span>
        );
      case 'Mixed':
        return (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700 dark:text-amber-400">
            <Minus size={16} /> Stable / Mixed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500">
            Insufficient data
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm" data-testid="container-market-price-assistant">
      {/* Title & Eyebrow */}
      <div className="flex flex-col gap-1 border-b border-[hsl(var(--border))] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[#163625] text-white">
              <Scale size={16} />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-[#f4a024]">
              Decision Support System
            </span>
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Agricultural Market Price Assistant
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Deterministic price statistics computed from verified Government of India observations with zero synthetic data.
          </p>
        </div>

        {/* Timeframe Selector */}
        <div className="mt-3 flex items-center gap-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-1 sm:mt-0">
          {(['2m', '6m', '1y', '2y', '5y'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setPeriod(t);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                period === t
                  ? 'bg-white text-[hsl(var(--foreground))] shadow-xs dark:bg-zinc-800'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              {t === '2m'
                ? '2 Months'
                : t === '6m'
                  ? '6 Months'
                  : t === '1y'
                    ? '1 Year'
                    : t === '2y'
                      ? '2 Years'
                      : '5 Years'}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleFormSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-xs font-semibold text-[hsl(var(--foreground))]">
            Crop / Commodity <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={crop}
            onChange={(e) => setCrop(e.target.value)}
            placeholder="e.g. Potato, Tomato, Onion"
            required
            className="mt-1.5 h-10 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 text-xs text-[hsl(var(--foreground))] focus:border-[#f4a024] focus:outline-hidden sm:text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-[hsl(var(--foreground))]">
            Variety <span className="text-[10px] text-[hsl(var(--muted-foreground))]">(Crop ≠ Variety)</span>
          </label>
          <input
            type="text"
            value={variety}
            onChange={(e) => setVariety(e.target.value)}
            placeholder="e.g. Kufri Jyoti, Pukhraj"
            className="mt-1.5 h-10 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 text-xs text-[hsl(var(--foreground))] focus:border-[#f4a024] focus:outline-hidden sm:text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-[hsl(var(--foreground))]">
            Target Mandi / Market
          </label>
          <input
            type="text"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            placeholder="e.g. Kanpur, Azadpur APMC"
            className="mt-1.5 h-10 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 text-xs text-[hsl(var(--foreground))] focus:border-[#f4a024] focus:outline-hidden sm:text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-[hsl(var(--foreground))]">
            Farmer Asking Price <span className="text-[10px] text-[hsl(var(--muted-foreground))]">(₹/quintal, optional)</span>
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              type="number"
              value={askingPrice}
              onChange={(e) => setAskingPrice(e.target.value)}
              placeholder="e.g. 1850"
              min="0"
              className="h-10 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 text-xs text-[hsl(var(--foreground))] focus:border-[#f4a024] focus:outline-hidden sm:text-sm"
            />
            <button
              type="submit"
              disabled={isLoading || !crop.trim()}
              className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#163625] px-4 text-xs font-bold text-white transition-all hover:bg-[#1a412c] disabled:opacity-50 sm:text-sm"
            >
              {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              <span>Analyze</span>
            </button>
          </div>
        </div>
      </form>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle size={16} className="shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-12 text-center text-xs text-[hsl(var(--muted-foreground))]">
          <Loader2 size={24} className="animate-spin text-[#f4a024]" />
          <p className="font-semibold text-[hsl(var(--foreground))]">
            Calculating official market observations...
          </p>
          <p className="text-[11px]">
            Aggregating modal prices, median range, and trend indicators.
          </p>
        </div>
      )}

      {/* Results Output */}
      {analysis && !isLoading && (
        <div className="space-y-5">
          {/* Header Metadata Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">Commodity: </span>
                <span className="font-bold text-[hsl(var(--foreground))]">{analysis.crop}</span>
              </div>
              <span className="text-[hsl(var(--border))]">·</span>
              <div>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">Variety: </span>
                <span className="font-semibold text-[hsl(var(--foreground))]">{analysis.variety}</span>
              </div>
              <span className="text-[hsl(var(--border))]">·</span>
              <div>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">Market: </span>
                <span className="font-semibold text-[hsl(var(--foreground))]">{analysis.selected_market}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {getConfidenceBadge(analysis.confidence)}
              {analysis.observations_count > 0 && (
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  {analysis.observations_count} records ({analysis.data_coverage_from} → {analysis.data_coverage_to})
                </span>
              )}
            </div>
          </div>

          {/* Insufficient Data Notice */}
          {!analysis.has_sufficient_data && (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-8 text-center">
              <ShieldAlert size={28} className="mx-auto text-amber-500" />
              <h3 className="mt-2 text-sm font-bold text-[hsl(var(--foreground))]">
                Not enough verified market observations to provide a price estimate
              </h3>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Farm2Fork does not fabricate or guess agricultural prices when official data coverage is insufficient. Try selecting a broader market or a longer timeframe.
              </p>
            </div>
          )}

          {/* Sufficient Data View */}
          {analysis.has_sufficient_data && (
            <>
              {/* 4 Metric Cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* 1. Latest Modal */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xs">
                  <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    Latest Modal Price
                  </span>
                  <div className="mt-2 font-display text-2xl font-bold text-[hsl(var(--foreground))]">
                    ₹{analysis.latest_modal?.toLocaleString('en-IN') ?? '—'}
                  </div>
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    {analysis.modal_unit} (official reference)
                  </span>
                </div>

                {/* 2. Recent Range & Median */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xs">
                  <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    Recent Range (Min – Max)
                  </span>
                  <div className="mt-2 font-display text-xl font-bold text-[hsl(var(--foreground))]">
                    ₹{analysis.recent_range_min?.toLocaleString('en-IN')} – ₹{analysis.recent_range_max?.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    Median: ₹{analysis.recent_median?.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* 3. Observed Trend */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xs">
                  <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    Observed Trend
                  </span>
                  <div className="mt-2">{getTrendBadge(analysis.trend)}</div>
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    Based on {analysis.observations_count} verified arrival batches
                  </span>
                </div>

                {/* 4. Asking Price Comparison */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xs">
                  <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    Asking Price vs Reference
                  </span>
                  <div className="mt-2 text-sm font-bold text-[hsl(var(--foreground))]">
                    {analysis.difference_summary ? (
                      <span
                        className={
                          (analysis.difference_amount ?? 0) > 0
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }
                      >
                        {analysis.difference_summary}
                      </span>
                    ) : (
                      <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
                        Enter asking price above to compare
                      </span>
                    )}
                  </div>
                  {onSelectPrice && analysis.latest_modal && (
                    <button
                      type="button"
                      onClick={() => onSelectPrice(analysis.latest_modal!)}
                      className="mt-1 text-[11px] font-semibold text-[#f4a024] hover:underline"
                    >
                      Use ₹{analysis.latest_modal} as asking price
                    </button>
                  )}
                </div>
              </div>

              {/* AI Explanation Card */}
              <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#163625] dark:text-emerald-400">
                  <Sparkles size={14} className="text-[#f4a024]" />
                  <span>AI Interpretation & Market Context</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--foreground))] sm:text-sm">
                  {analysis.ai_interpretation}
                </p>
              </div>

              {/* Nearby Mandi Comparison Table */}
              {analysis.market_comparison.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                  <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-4 py-3 text-xs font-bold text-[hsl(var(--foreground))]">
                    Nearby Regional Mandi References
                  </div>
                  <div className="divide-y divide-[hsl(var(--border))] text-xs">
                    {analysis.market_comparison.map((m, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-[hsl(var(--muted))]"
                      >
                        <div>
                          <span className="font-semibold text-[hsl(var(--foreground))]">
                            {m.market}
                          </span>
                          <span className="ml-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                            {m.location}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono-ui font-bold text-[hsl(var(--foreground))]">
                            ₹{m.avg_modal.toLocaleString('en-IN')}/quintal
                          </span>
                          {m.last_date && (
                            <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                              {m.last_date}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Mandatory Disclaimer Callout */}
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <Info size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <span className="font-bold">Important Notice: </span>
              <span>{analysis.disclaimer}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
