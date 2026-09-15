ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS profile_photo_path text,
    ADD COLUMN IF NOT EXISTS bio text,
    ADD COLUMN IF NOT EXISTS city text,
    ADD COLUMN IF NOT EXISTS state text;

ALTER TABLE public.farmers
    ADD COLUMN IF NOT EXISTS crops_grown text,
    ADD COLUMN IF NOT EXISTS farming_experience text,
    ADD COLUMN IF NOT EXISTS farm_description text;

ALTER TABLE public.buyers
    ADD COLUMN IF NOT EXISTS buyer_type text,
    ADD COLUMN IF NOT EXISTS purchasing_interests text,
    ADD COLUMN IF NOT EXISTS preferred_crops text,
    ADD COLUMN IF NOT EXISTS business_location text;

CREATE TABLE IF NOT EXISTS public.identity_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    verification_type text NOT NULL,
    status text NOT NULL DEFAULT 'NOT_SUBMITTED',
    masked_identifier text,
    provider text,
    provider_reference text,
    name_match boolean,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT identity_verifications_type_check CHECK (verification_type IN ('PAN')),
    CONSTRAINT identity_verifications_status_check CHECK (status IN ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'FAILED')),
    UNIQUE (user_id, verification_type)
);

CREATE INDEX IF NOT EXISTS identity_verifications_user_idx
    ON public.identity_verifications (user_id, verification_type);

DROP TRIGGER IF EXISTS identity_verifications_set_updated_at ON public.identity_verifications;
CREATE TRIGGER identity_verifications_set_updated_at
    BEFORE UPDATE ON public.identity_verifications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.identity_verifications (user_id, verification_type)
SELECT id, 'PAN' FROM public.profiles
ON CONFLICT (user_id, verification_type) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.identity_verifications TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', false)
ON CONFLICT (id) DO NOTHING;