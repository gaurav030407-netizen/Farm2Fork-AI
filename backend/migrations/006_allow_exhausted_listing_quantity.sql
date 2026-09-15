-- An exact-quantity order can exhaust a listing. New listings still require
-- positive quantity; SOLD listings may hold zero available quantity.
ALTER TABLE public.crop_listings
    DROP CONSTRAINT crop_listings_quantity_check;

ALTER TABLE public.crop_listings
    ADD CONSTRAINT crop_listings_quantity_check CHECK (quantity >= 0);