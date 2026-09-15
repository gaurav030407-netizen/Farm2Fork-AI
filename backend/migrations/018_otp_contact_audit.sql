-- Durable OTP delivery, contact-change verification, and security audit records.

ALTER TABLE public.pending_registrations
    ALTER COLUMN email DROP NOT NULL,
    ALTER COLUMN location DROP NOT NULL,
    ALTER COLUMN organization_name DROP NOT NULL;

ALTER TABLE public.pending_registrations
    ADD COLUMN IF NOT EXISTS otp_method text NOT NULL DEFAULT 'EMAIL';

ALTER TABLE public.pending_registrations
    DROP CONSTRAINT IF EXISTS pending_registrations_otp_method_check;
ALTER TABLE public.pending_registrations
    ADD CONSTRAINT pending_registrations_otp_method_check CHECK (otp_method IN ('EMAIL', 'SMS'));

DROP INDEX IF EXISTS pending_registrations_email_lower_idx;
CREATE UNIQUE INDEX IF NOT EXISTS pending_registrations_email_lower_idx
    ON public.pending_registrations (lower(email))
    WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS pending_registrations_mobile_idx
    ON public.pending_registrations (mobile)
    WHERE mobile IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.auth_otp_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier text NOT NULL,
    method text NOT NULL,
    purpose text NOT NULL,
    profile_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
    otp_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    last_sent_at timestamptz NOT NULL DEFAULT now(),
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT auth_otp_method_check CHECK (method IN ('EMAIL', 'SMS')),
    CONSTRAINT auth_otp_purpose_check CHECK (purpose IN ('LOGIN', 'CONTACT_CHANGE', 'REGISTRATION')),
    CONSTRAINT auth_otp_attempts_check CHECK (attempts >= 0)
);
CREATE INDEX IF NOT EXISTS auth_otp_identifier_idx ON public.auth_otp_challenges (identifier, purpose, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS auth_otp_active_challenge_idx
    ON public.auth_otp_challenges (identifier, purpose)
    WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.security_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
    event_type text NOT NULL,
    identifier text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_audit_profile_idx ON public.security_audit_events (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_event_type_idx ON public.security_audit_events (event_type, created_at DESC);

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS preferred_otp_method text NOT NULL DEFAULT 'EMAIL';
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_preferred_otp_method_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_preferred_otp_method_check CHECK (preferred_otp_method IN ('EMAIL', 'SMS'));
