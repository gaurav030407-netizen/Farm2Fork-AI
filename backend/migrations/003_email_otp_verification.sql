-- Email verification state for Node-owned accounts. Safe for existing profiles.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_otp_hash text,
    ADD COLUMN IF NOT EXISTS email_otp_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS email_otp_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS email_otp_last_sent_at timestamptz;

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_email_otp_attempts_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_email_otp_attempts_check
    CHECK (email_otp_attempts >= 0);

CREATE INDEX IF NOT EXISTS profiles_unverified_email_idx
    ON public.profiles (lower(email))
    WHERE email_verified = false AND email IS NOT NULL;
