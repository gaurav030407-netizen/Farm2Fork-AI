ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check CHECK (role IN ('FARMER', 'BUYER', 'CONSUMER', 'ADMIN'));

ALTER TABLE public.buyers
    ALTER COLUMN business_name DROP NOT NULL,
    ALTER COLUMN location DROP NOT NULL;

ALTER TABLE public.pending_registrations
    ALTER COLUMN location DROP NOT NULL,
    ALTER COLUMN organization_name DROP NOT NULL;

ALTER TABLE public.pending_registrations
    DROP CONSTRAINT IF EXISTS pending_registrations_role_check;

ALTER TABLE public.pending_registrations
    ADD CONSTRAINT pending_registrations_role_check CHECK (role IN ('FARMER', 'BUYER', 'CONSUMER'));