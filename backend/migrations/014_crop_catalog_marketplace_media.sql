-- Dynamic catalog populated only from the connected official mandi data source.
CREATE TABLE IF NOT EXISTS public.crops (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    normalized_name text NOT NULL UNIQUE,
    source_commodity text NOT NULL,
    category text NOT NULL DEFAULT 'Other',
    image_url text,
    description text,
    last_synced_at timestamptz,
    source_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crop_varieties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    crop_id uuid NOT NULL REFERENCES public.crops(id) ON DELETE CASCADE,
    name text NOT NULL,
    normalized_name text NOT NULL,
    source text NOT NULL DEFAULT 'DATA_GOV_IN',
    source_variety text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (crop_id, normalized_name, source)
);

CREATE TABLE IF NOT EXISTS public.market_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    crop_id uuid NOT NULL REFERENCES public.crops(id) ON DELETE RESTRICT,
    variety_id uuid REFERENCES public.crop_varieties(id) ON DELETE SET NULL,
    source_commodity text NOT NULL,
    source_variety text,
    state text,
    district text,
    market text,
    grade text,
    arrival_date date,
    min_price numeric,
    max_price numeric,
    modal_price numeric,
    unit text,
    source text NOT NULL DEFAULT 'Government of India - data.gov.in',
    source_record_hash text NOT NULL UNIQUE,
    source_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crop_listings
    ADD COLUMN IF NOT EXISTS crop_id uuid REFERENCES public.crops(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS variety_id uuid REFERENCES public.crop_varieties(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS farmer_entered_variety text,
    ADD COLUMN IF NOT EXISTS price_unit text,
    ADD COLUMN IF NOT EXISTS available_from date,
    ADD COLUMN IF NOT EXISTS description text;

CREATE TABLE IF NOT EXISTS public.crop_listing_media (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id uuid NOT NULL REFERENCES public.crop_listings(id) ON DELETE CASCADE,
    media_type text NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
    storage_key text NOT NULL UNIQUE,
    mime_type text NOT NULL,
    file_size bigint NOT NULL CHECK (file_size > 0),
    thumbnail_key text,
    duration_seconds integer,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crop_varieties_crop_idx ON public.crop_varieties(crop_id, name);
CREATE INDEX IF NOT EXISTS market_prices_crop_date_idx ON public.market_prices(crop_id, arrival_date DESC);
CREATE INDEX IF NOT EXISTS market_prices_variety_date_idx ON public.market_prices(variety_id, arrival_date DESC);
CREATE INDEX IF NOT EXISTS market_prices_location_idx ON public.market_prices(state, district, market, arrival_date DESC);
CREATE INDEX IF NOT EXISTS crop_listing_media_listing_idx ON public.crop_listing_media(listing_id, sort_order);
CREATE INDEX IF NOT EXISTS crop_listings_crop_variety_idx ON public.crop_listings(crop_id, variety_id);
