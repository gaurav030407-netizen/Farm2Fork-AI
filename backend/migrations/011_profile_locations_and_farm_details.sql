ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS address text,
    ADD COLUMN IF NOT EXISTS locality text,
    ADD COLUMN IF NOT EXISTS landmark text,
    ADD COLUMN IF NOT EXISTS pin_code text,
    ADD COLUMN IF NOT EXISTS latitude double precision,
    ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE public.farmers
    ADD COLUMN IF NOT EXISTS farm_size numeric,
    ADD COLUMN IF NOT EXISTS farm_size_unit text,
    ADD COLUMN IF NOT EXISTS farming_type text;

ALTER TABLE public.buyers
    ADD COLUMN IF NOT EXISTS delivery_address text;

ALTER TABLE public.farmers
    DROP CONSTRAINT IF EXISTS farmers_farm_size_unit_check,
    DROP CONSTRAINT IF EXISTS farmers_farming_type_check;

ALTER TABLE public.farmers
    ADD CONSTRAINT farmers_farm_size_unit_check CHECK (farm_size_unit IS NULL OR farm_size_unit IN ('acres', 'hectares')),
    ADD CONSTRAINT farmers_farming_type_check CHECK (farming_type IS NULL OR farming_type IN ('Organic', 'Conventional', 'Mixed', 'Other'));

CREATE INDEX IF NOT EXISTS profiles_location_idx
    ON public.profiles (city, state);