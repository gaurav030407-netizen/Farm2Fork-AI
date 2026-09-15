CREATE TABLE IF NOT EXISTS public.market_data_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    source_type text NOT NULL DEFAULT 'PUBLIC',
    base_url text,
    enabled boolean NOT NULL DEFAULT true,
    last_success_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT market_data_sources_type_check CHECK (source_type IN ('PUBLIC', 'PRIVATE', 'MANUAL'))
);

CREATE TABLE IF NOT EXISTS public.market_price_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id uuid REFERENCES public.market_data_sources (id) ON DELETE SET NULL,
    crop_name text NOT NULL,
    variety text,
    market_name text,
    district_name text,
    state_name text,
    commodity_group text,
    grade text,
    unit text,
    price numeric,
    observed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT market_price_records_price_check CHECK (price IS NULL OR price >= 0)
);

CREATE INDEX IF NOT EXISTS market_data_sources_enabled_idx
    ON public.market_data_sources (enabled, last_success_at DESC);

CREATE INDEX IF NOT EXISTS market_price_records_crop_name_idx
    ON public.market_price_records (crop_name, observed_at DESC);

CREATE INDEX IF NOT EXISTS market_price_records_observed_idx
    ON public.market_price_records (observed_at DESC);

CREATE OR REPLACE FUNCTION public.market_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE TRIGGER market_data_sources_set_updated_at
    BEFORE UPDATE ON public.market_data_sources
    FOR EACH ROW
    EXECUTE FUNCTION public.market_set_updated_at();

CREATE TRIGGER market_price_records_set_updated_at
    BEFORE UPDATE ON public.market_price_records
    FOR EACH ROW
    EXECUTE FUNCTION public.market_set_updated_at();

INSERT INTO public.market_data_sources (name, source_type, base_url, enabled, metadata)
SELECT 'AGMARKNET', 'PUBLIC', 'https://agmarknet.gov.in/', true, '{"official": true, "notes": "Public government market data source"}'
WHERE NOT EXISTS (
    SELECT 1 FROM public.market_data_sources WHERE name = 'AGMARKNET'
);