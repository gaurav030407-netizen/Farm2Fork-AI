-- Driver, contact verification, payment, delivery, and notification foundations.
-- Provider credentials and gateway calls remain server-side application concerns.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS phone_number text,
    ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

ALTER TABLE public.pending_registrations
    DROP CONSTRAINT IF EXISTS pending_registrations_role_check;

ALTER TABLE public.pending_registrations
    ADD CONSTRAINT pending_registrations_role_check
    CHECK (role IN ('FARMER', 'BUYER', 'CONSUMER', 'DRIVER'));

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('FARMER', 'BUYER', 'CONSUMER', 'DRIVER', 'ADMIN'));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_unique_idx
    ON public.profiles (phone_number)
    WHERE phone_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.drivers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
    service_area text NOT NULL,
    vehicle_type text NOT NULL,
    vehicle_registration text,
    availability_status text NOT NULL DEFAULT 'OFFLINE',
    approval_status text NOT NULL DEFAULT 'PENDING',
    current_latitude numeric,
    current_longitude numeric,
    location_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT drivers_availability_status_check CHECK (availability_status IN ('ONLINE', 'OFFLINE')),
    CONSTRAINT drivers_approval_status_check CHECK (approval_status IN ('PENDING', 'APPROVED', 'SUSPENDED')),
    CONSTRAINT drivers_latitude_check CHECK (current_latitude IS NULL OR current_latitude BETWEEN -90 AND 90),
    CONSTRAINT drivers_longitude_check CHECK (current_longitude IS NULL OR current_longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS public.delivery_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL UNIQUE REFERENCES public.orders (id) ON DELETE CASCADE,
    driver_id uuid REFERENCES public.drivers (id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'AVAILABLE',
    pickup_location text NOT NULL,
    delivery_location text NOT NULL,
    estimated_distance_km numeric,
    accepted_at timestamptz,
    picked_up_at timestamptz,
    delivered_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_jobs_status_check CHECK (status IN ('AVAILABLE', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'CANCELLED'))
);

ALTER TABLE public.delivery_jobs
    ADD COLUMN IF NOT EXISTS pickup_latitude numeric,
    ADD COLUMN IF NOT EXISTS pickup_longitude numeric;

CREATE INDEX IF NOT EXISTS delivery_jobs_status_idx ON public.delivery_jobs (status);
CREATE INDEX IF NOT EXISTS delivery_jobs_driver_id_idx ON public.delivery_jobs (driver_id);

CREATE TABLE IF NOT EXISTS public.delivery_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_job_id uuid NOT NULL REFERENCES public.delivery_jobs (id) ON DELETE CASCADE,
    kind text NOT NULL,
    otp_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_verifications_kind_check CHECK (kind IN ('PICKUP', 'DELIVERY')),
    CONSTRAINT delivery_verifications_attempts_check CHECK (attempts >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_verifications_active_idx
    ON public.delivery_verifications (delivery_job_id, kind)
    WHERE verified_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
    payer_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'CREATED',
    amount numeric NOT NULL,
    currency text NOT NULL DEFAULT 'INR',
    payment_method text,
    gateway_reference text,
    provider_payment_id text,
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payments_status_check CHECK (status IN ('CREATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
    CONSTRAINT payments_amount_check CHECK (amount >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_order_active_idx ON public.payments (order_id) WHERE status NOT IN ('FAILED', 'CANCELLED');
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_unique_idx ON public.payments (provider_payment_id) WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid REFERENCES public.payments (id) ON DELETE SET NULL,
    provider_event_id text NOT NULL UNIQUE,
    event_type text NOT NULL,
    payload_hash text NOT NULL,
    processed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transaction_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL UNIQUE REFERENCES public.payments (id) ON DELETE RESTRICT,
    reference text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driver_earnings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_job_id uuid NOT NULL UNIQUE REFERENCES public.delivery_jobs (id) ON DELETE RESTRICT,
    driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
    amount numeric NOT NULL,
    status text NOT NULL DEFAULT 'ELIGIBLE',
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT driver_earnings_status_check CHECK (status IN ('ELIGIBLE', 'PAID')),
    CONSTRAINT driver_earnings_amount_check CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.notification_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    kind text NOT NULL,
    channel text NOT NULL,
    status text NOT NULL DEFAULT 'PENDING',
    reference_id uuid,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.idempotency_records (
    key text PRIMARY KEY,
    scope text NOT NULL,
    response_status integer,
    response_body jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_order_id_idx ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS payments_payer_profile_id_idx ON public.payments (payer_profile_id);
CREATE INDEX IF NOT EXISTS driver_earnings_driver_id_idx ON public.driver_earnings (driver_id);
CREATE INDEX IF NOT EXISTS notification_records_profile_id_idx ON public.notification_records (profile_id);

CREATE OR REPLACE FUNCTION public.set_driver_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS drivers_set_updated_at ON public.drivers;
CREATE TRIGGER drivers_set_updated_at BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.set_driver_updated_at();

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'CREATED';
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('CREATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'));
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON public.orders (payment_status);
