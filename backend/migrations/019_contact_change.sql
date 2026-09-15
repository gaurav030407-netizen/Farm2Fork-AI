CREATE TABLE IF NOT EXISTS public.contact_change_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    contact_type text NOT NULL,
    new_value text NOT NULL,
    otp_method text NOT NULL,
    otp_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    last_sent_at timestamptz NOT NULL DEFAULT now(),
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT contact_change_type_check CHECK (contact_type IN ('EMAIL', 'PHONE')),
    CONSTRAINT contact_change_method_check CHECK (otp_method IN ('EMAIL', 'SMS')),
    CONSTRAINT contact_change_attempts_check CHECK (attempts >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_change_active_idx
    ON public.contact_change_challenges (profile_id, contact_type)
    WHERE verified_at IS NULL;
CREATE INDEX IF NOT EXISTS contact_change_value_idx
    ON public.contact_change_challenges (contact_type, new_value);
