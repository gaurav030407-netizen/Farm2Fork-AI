-- Migration 021: Admin moderation enhancements, catalog flags, and indexing

ALTER TABLE public.crop_listing_media
    ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE public.crop_listing_media
    DROP CONSTRAINT IF EXISTS crop_listing_media_moderation_status_check;

ALTER TABLE public.crop_listing_media
    ADD CONSTRAINT crop_listing_media_moderation_status_check
    CHECK (moderation_status IN ('ACTIVE', 'FLAGGED', 'HIDDEN'));

CREATE INDEX IF NOT EXISTS crop_listing_media_moderation_idx
    ON public.crop_listing_media (moderation_status);

ALTER TABLE public.crops
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.crop_varieties
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS crops_active_idx
    ON public.crops (is_active, name);

CREATE INDEX IF NOT EXISTS crop_varieties_active_idx
    ON public.crop_varieties (crop_id, is_active, name);

CREATE INDEX IF NOT EXISTS security_audit_created_idx
    ON public.security_audit_events (created_at DESC);
