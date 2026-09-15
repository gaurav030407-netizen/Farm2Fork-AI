-- Local Node JWT authentication fields on the existing profile model.
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email text,
    ADD COLUMN IF NOT EXISTS password_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_idx
    ON public.profiles (lower(email))
    WHERE email IS NOT NULL;

