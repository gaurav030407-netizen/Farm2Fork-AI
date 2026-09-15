-- Pending email-verification state. Permanent FARMER/BUYER profiles are
-- created only after a successful OTP verification.
CREATE TABLE IF NOT EXISTS public.pending_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    name text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    mobile text,
    location text NOT NULL,
    organization_name text NOT NULL,
    otp_hash text NOT NULL,
    otp_expires_at timestamptz NOT NULL,
    otp_attempts integer NOT NULL DEFAULT 0,
    otp_last_sent_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pending_registrations_role_check CHECK (role IN ('FARMER', 'BUYER')),
    CONSTRAINT pending_registrations_otp_attempts_check CHECK (otp_attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS pending_registrations_email_lower_idx
    ON public.pending_registrations (lower(email));

CREATE OR REPLACE FUNCTION public.set_pending_registration_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS pending_registrations_set_updated_at ON public.pending_registrations;
CREATE TRIGGER pending_registrations_set_updated_at
    BEFORE UPDATE ON public.pending_registrations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_pending_registration_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_unverified_local_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF NEW.role IN ('FARMER', 'BUYER') AND NEW.email_verified IS NOT TRUE THEN
        RAISE EXCEPTION 'FARMER and BUYER profiles must be email verified';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_prevent_unverified_local_account ON public.profiles;
CREATE TRIGGER profiles_prevent_unverified_local_account
    BEFORE INSERT OR UPDATE OF role, email_verified ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_unverified_local_account();
