-- Move registrations created by the pre-pending flow out of permanent account
-- tables. Expired/missing legacy OTP material requires a normal resend.
INSERT INTO public.pending_registrations (
    email, name, password_hash, role, mobile, location, organization_name,
    otp_hash, otp_expires_at, otp_attempts, otp_last_sent_at
)
SELECT
    p.email,
    p.name,
    p.password_hash,
    p.role,
    p.mobile,
    p.location,
    CASE
        WHEN p.role = 'FARMER' THEN f.farm_name
        ELSE b.business_name
    END,
    COALESCE(p.email_otp_hash, 'invalidated-legacy-otp'),
    COALESCE(p.email_otp_expires_at, now()),
    COALESCE(p.email_otp_attempts, 0),
    COALESCE(p.email_otp_last_sent_at, now() - interval '60 seconds')
FROM public.profiles AS p
LEFT JOIN public.farmers AS f ON f.profile_id = p.id
LEFT JOIN public.buyers AS b ON b.profile_id = p.id
WHERE p.role IN ('FARMER', 'BUYER')
  AND p.email_verified IS NOT TRUE
  AND p.email IS NOT NULL
  AND p.password_hash IS NOT NULL
  AND (f.id IS NOT NULL OR b.id IS NOT NULL)
ON CONFLICT ((lower(email))) DO NOTHING;

DELETE FROM public.profiles
WHERE role IN ('FARMER', 'BUYER')
  AND email_verified IS NOT TRUE;
