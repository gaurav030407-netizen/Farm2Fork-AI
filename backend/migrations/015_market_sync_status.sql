CREATE TABLE IF NOT EXISTS public.market_sync_status (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    last_success_at timestamptz,
    last_attempt_at timestamptz,
    records_imported integer NOT NULL DEFAULT 0,
    upstream_status text NOT NULL DEFAULT 'NOT_SYNCED',
    rate_limit_count integer NOT NULL DEFAULT 0,
    cooldown_until timestamptz,
    last_error_category text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.market_sync_status (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
CREATE INDEX IF NOT EXISTS market_prices_cached_lookup_idx
  ON public.market_prices (source_commodity, source_variety, state, district, market, arrival_date DESC);
