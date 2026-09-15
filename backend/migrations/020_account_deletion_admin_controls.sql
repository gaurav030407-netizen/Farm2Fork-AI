-- Account retention state, admin moderation, reports, and editorial content.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
    ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
    ADD COLUMN IF NOT EXISTS suspended_reason text;

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_account_status_check CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'DELETED'));
CREATE INDEX IF NOT EXISTS profiles_account_status_idx ON public.profiles (account_status);

CREATE TABLE IF NOT EXISTS public.listing_moderation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id uuid NOT NULL REFERENCES public.crop_listings (id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'ACTIVE',
    reason text,
    acted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT listing_moderation_status_check CHECK (status IN ('ACTIVE', 'FLAGGED', 'HIDDEN', 'SOLD', 'EXPIRED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS listing_moderation_listing_idx ON public.listing_moderation (listing_id);

CREATE TABLE IF NOT EXISTS public.user_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
    reported_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
    listing_id uuid REFERENCES public.crop_listings (id) ON DELETE SET NULL,
    order_id uuid REFERENCES public.orders (id) ON DELETE SET NULL,
    reason text NOT NULL,
    description text NOT NULL,
    status text NOT NULL DEFAULT 'OPEN',
    resolution_note text,
    resolved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_reports_status_check CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED'))
);
CREATE INDEX IF NOT EXISTS user_reports_status_idx ON public.user_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.content_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    short_description text,
    content text NOT NULL,
    category text NOT NULL,
    status text NOT NULL DEFAULT 'DRAFT',
    publish_at timestamptz,
    expires_at timestamptz,
    author_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT content_items_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS content_items_public_idx ON public.content_items (status, publish_at, expires_at);
