import { Truck, Sprout, Store, ShoppingCart, ShieldCheck, MapPin, CheckCircle2 } from 'lucide-react';

export function FarmDeliveryVisual() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
      {/* Header Bar */}
      <div className="mb-6 flex items-center justify-between border-b border-[hsl(var(--border))] pb-3 text-xs">
        <div className="flex items-center gap-1.5 font-mono-ui font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
          <ShieldCheck size={14} />
          Direct Supply Flow
        </div>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Direct Supply Network
        </span>
      </div>

      {/* Main Visual Pipeline */}
      <div className="space-y-6">
        {/* Step 1: The Farm & Farmer */}
        <div className="flex items-center gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.4)] p-3.5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <Sprout size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-bold text-[hsl(var(--foreground))]">
                1. Harvest at Farm Source
              </span>
              <span className="rounded bg-[hsl(var(--primary)/.1)] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                Direct
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              Farmer lists verified lots by official crop & variety with benchmarked mandi modal prices.
            </p>
          </div>
        </div>

        {/* Animated Road Transit Strip */}
        <div className="relative rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-5 overflow-hidden">
          {/* Subtle Road Path */}
          <div className="relative h-10 w-full rounded-lg bg-[hsl(var(--muted))] flex items-center overflow-hidden">
            {/* Road center dashed line */}
            <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 border-b-2 border-dashed border-[hsl(var(--border))]" />
            
            {/* Moving Truck */}
            <div className="delivery-truck-animation flex items-center gap-1.5 rounded-full bg-[hsl(var(--primary))] px-3 py-1 text-white shadow-md z-10">
              <Truck size={15} className="animate-pulse" />
              <span className="text-[10px] font-bold tracking-wider uppercase whitespace-nowrap">
                F2F Logistics
              </span>
            </div>

            {/* Road waypoints */}
            <div className="absolute left-2 text-[9px] font-bold text-[hsl(var(--muted-foreground))] opacity-70">
              PICKUP
            </div>
            <div className="absolute right-2 text-[9px] font-bold text-[hsl(var(--muted-foreground))] opacity-70">
              DELIVERY
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-[hsl(var(--muted-foreground))]">
            <span className="flex items-center gap-1">
              <MapPin size={11} className="text-[hsl(var(--primary))]" /> Direct farm gate pickup
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 size={11} className="text-emerald-600" /> OTP-verified handoff
            </span>
          </div>
        </div>

        {/* Step 2: Bulk Buyers & Household Consumers */}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Bulk Buyer Destination */}
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.3)] p-3.5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700 dark:text-blue-400">
                <Store size={17} />
              </div>
              <div>
                <div className="text-xs font-bold text-[hsl(var(--foreground))]">Bulk Buyer</div>
                <div className="text-[10px] text-[hsl(var(--muted-foreground))]">Wholesale & HoReCa</div>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              Source truckloads and negotiated consignments directly from growers.
            </p>
          </div>

          {/* Consumer Destination */}
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.3)] p-3.5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                <ShoppingCart size={17} />
              </div>
              <div>
                <div className="text-xs font-bold text-[hsl(var(--foreground))]">Consumer</div>
                <div className="text-[10px] text-[hsl(var(--muted-foreground))]">Household Kitchens</div>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              Buy retail quantities (1–5 kg) of farm-fresh produce with clear harvest dates.
            </p>
          </div>
        </div>
      </div>

      {/* Embedded CSS for smooth truck movement */}
      <style>{`
        @keyframes moveTruck {
          0% {
            transform: translateX(0%);
          }
          45% {
            transform: translateX(calc(100% + 140px));
          }
          50% {
            transform: translateX(calc(100% + 140px));
          }
          95% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(0%);
          }
        }
        .delivery-truck-animation {
          animation: moveTruck 10s ease-in-out infinite;
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
