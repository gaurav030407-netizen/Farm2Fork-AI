-- Farm2Fork core MVP schema and security foundation.
-- Executed as one transaction against Supabase PostgreSQL only.

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    name text NOT NULL,
    role text NOT NULL,
    mobile text,
    location text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT profiles_role_check CHECK (role IN ('FARMER', 'BUYER', 'ADMIN'))
);

CREATE TABLE public.farmers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
    farm_name text NOT NULL,
    location text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.buyers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
    business_name text NOT NULL,
    location text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.crop_listings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id uuid NOT NULL REFERENCES public.farmers (id) ON DELETE CASCADE,
    crop_name text NOT NULL,
    variety text,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    price numeric NOT NULL,
    quality text,
    location text NOT NULL,
    harvest_date date,
    image_url text,
    status text NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT crop_listings_quantity_check CHECK (quantity > 0),
    CONSTRAINT crop_listings_price_check CHECK (price >= 0),
    CONSTRAINT crop_listings_status_check CHECK (status IN ('ACTIVE', 'SOLD', 'INACTIVE'))
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id uuid NOT NULL REFERENCES public.buyers (id) ON DELETE RESTRICT,
    farmer_id uuid NOT NULL REFERENCES public.farmers (id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'PENDING',
    total_amount numeric NOT NULL,
    delivery_location text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT orders_status_check CHECK (
        status IN (
            'PENDING',
            'ACCEPTED',
            'REJECTED',
            'PROCESSING',
            'OUT_FOR_DELIVERY',
            'DELIVERED',
            'CANCELLED'
        )
    ),
    CONSTRAINT orders_total_amount_check CHECK (total_amount >= 0)
);

CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
    crop_listing_id uuid NOT NULL REFERENCES public.crop_listings (id) ON DELETE RESTRICT,
    quantity numeric NOT NULL,
    price numeric NOT NULL,
    subtotal numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
    CONSTRAINT order_items_price_check CHECK (price >= 0),
    CONSTRAINT order_items_subtotal_check CHECK (subtotal >= 0)
);

CREATE INDEX crop_listings_farmer_id_idx
    ON public.crop_listings (farmer_id);

CREATE INDEX crop_listings_crop_name_idx
    ON public.crop_listings (crop_name);

CREATE INDEX crop_listings_status_idx
    ON public.crop_listings (status);

CREATE INDEX crop_listings_location_idx
    ON public.crop_listings (location);

CREATE INDEX orders_buyer_id_idx
    ON public.orders (buyer_id);

CREATE INDEX orders_farmer_id_idx
    ON public.orders (farmer_id);

CREATE INDEX orders_status_idx
    ON public.orders (status);

CREATE INDEX order_items_order_id_idx
    ON public.order_items (order_id);

CREATE INDEX order_items_crop_listing_id_idx
    ON public.order_items (crop_listing_id);

GRANT SELECT, INSERT, UPDATE
    ON public.profiles
    TO authenticated;

GRANT SELECT, INSERT, UPDATE
    ON public.farmers
    TO authenticated;

GRANT SELECT, INSERT, UPDATE
    ON public.buyers
    TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.crop_listings
    TO authenticated;

GRANT SELECT, INSERT, UPDATE
    ON public.orders
    TO authenticated;

GRANT SELECT, INSERT
    ON public.order_items
    TO authenticated;

CREATE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
    SELECT p.role
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
$function$;

CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.id = auth.uid()
          AND p.role = 'ADMIN'
    )
$function$;

CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE FUNCTION public.prevent_farmer_order_field_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF public.current_user_role() = 'FARMER'
       AND (
           NEW.id IS DISTINCT FROM OLD.id
           OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
           OR NEW.farmer_id IS DISTINCT FROM OLD.farmer_id
           OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
           OR NEW.delivery_location IS DISTINCT FROM OLD.delivery_location
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       )
    THEN
        RAISE EXCEPTION 'Farmers may update order status only';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER profiles_set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER crop_listings_set_updated_at
    BEFORE UPDATE ON public.crop_listings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER orders_prevent_farmer_field_changes
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_farmer_order_field_changes();

CREATE TRIGGER orders_set_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own_or_admin
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_insert_own_or_admin
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            id = auth.uid()
            AND role IN ('FARMER', 'BUYER')
        )
        OR public.is_admin()
    );

CREATE POLICY profiles_update_own_or_admin
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid() OR public.is_admin())
    WITH CHECK (
        (
            id = auth.uid()
            AND role IN ('FARMER', 'BUYER')
        )
        OR public.is_admin()
    );

CREATE POLICY farmers_select_own_or_admin
    ON public.farmers
    FOR SELECT
    TO authenticated
    USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY farmers_insert_own_or_admin
    ON public.farmers
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            profile_id = auth.uid()
            AND public.current_user_role() = 'FARMER'
        )
        OR public.is_admin()
    );

CREATE POLICY farmers_update_own_or_admin
    ON public.farmers
    FOR UPDATE
    TO authenticated
    USING (profile_id = auth.uid() OR public.is_admin())
    WITH CHECK (
        (
            profile_id = auth.uid()
            AND public.current_user_role() = 'FARMER'
        )
        OR public.is_admin()
    );

CREATE POLICY buyers_select_own_or_admin
    ON public.buyers
    FOR SELECT
    TO authenticated
    USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY buyers_insert_own_or_admin
    ON public.buyers
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            profile_id = auth.uid()
            AND public.current_user_role() = 'BUYER'
        )
        OR public.is_admin()
    );

CREATE POLICY buyers_update_own_or_admin
    ON public.buyers
    FOR UPDATE
    TO authenticated
    USING (profile_id = auth.uid() OR public.is_admin())
    WITH CHECK (
        (
            profile_id = auth.uid()
            AND public.current_user_role() = 'BUYER'
        )
        OR public.is_admin()
    );

CREATE POLICY crop_listings_select_active_or_owner
    ON public.crop_listings
    FOR SELECT
    TO authenticated
    USING (
        status = 'ACTIVE'
        OR farmer_id IN (
            SELECT f.id
            FROM public.farmers AS f
            WHERE f.profile_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY crop_listings_insert_own_or_admin
    ON public.crop_listings
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            farmer_id IN (
                SELECT f.id
                FROM public.farmers AS f
                WHERE f.profile_id = auth.uid()
            )
            AND public.current_user_role() = 'FARMER'
        )
        OR public.is_admin()
    );

CREATE POLICY crop_listings_update_own_or_admin
    ON public.crop_listings
    FOR UPDATE
    TO authenticated
    USING (
        farmer_id IN (
            SELECT f.id
            FROM public.farmers AS f
            WHERE f.profile_id = auth.uid()
        )
        OR public.is_admin()
    )
    WITH CHECK (
        (
            farmer_id IN (
                SELECT f.id
                FROM public.farmers AS f
                WHERE f.profile_id = auth.uid()
            )
            AND public.current_user_role() = 'FARMER'
        )
        OR public.is_admin()
    );

CREATE POLICY crop_listings_delete_own_or_admin
    ON public.crop_listings
    FOR DELETE
    TO authenticated
    USING (
        farmer_id IN (
            SELECT f.id
            FROM public.farmers AS f
            WHERE f.profile_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY orders_select_buyer_farmer_or_admin
    ON public.orders
    FOR SELECT
    TO authenticated
    USING (
        buyer_id IN (
            SELECT b.id
            FROM public.buyers AS b
            WHERE b.profile_id = auth.uid()
        )
        OR farmer_id IN (
            SELECT f.id
            FROM public.farmers AS f
            WHERE f.profile_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY orders_insert_own_buyer_or_admin
    ON public.orders
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            buyer_id IN (
                SELECT b.id
                FROM public.buyers AS b
                WHERE b.profile_id = auth.uid()
            )
            AND public.current_user_role() = 'BUYER'
            AND status = 'PENDING'
        )
        OR public.is_admin()
    );

CREATE POLICY orders_update_farmer_status_or_admin
    ON public.orders
    FOR UPDATE
    TO authenticated
    USING (
        (
            farmer_id IN (
                SELECT f.id
                FROM public.farmers AS f
                WHERE f.profile_id = auth.uid()
            )
            AND public.current_user_role() = 'FARMER'
        )
        OR public.is_admin()
    )
    WITH CHECK (
        (
            farmer_id IN (
                SELECT f.id
                FROM public.farmers AS f
                WHERE f.profile_id = auth.uid()
            )
            AND public.current_user_role() = 'FARMER'
        )
        OR public.is_admin()
    );

CREATE POLICY order_items_select_related_order_or_admin
    ON public.order_items
    FOR SELECT
    TO authenticated
    USING (
        order_id IN (
            SELECT o.id
            FROM public.orders AS o
            WHERE o.buyer_id IN (
                SELECT b.id
                FROM public.buyers AS b
                WHERE b.profile_id = auth.uid()
            )
            OR o.farmer_id IN (
                SELECT f.id
                FROM public.farmers AS f
                WHERE f.profile_id = auth.uid()
            )
        )
        OR public.is_admin()
    );

CREATE POLICY order_items_insert_own_pending_order_or_admin
    ON public.order_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            order_id IN (
                SELECT o.id
                FROM public.orders AS o
                JOIN public.buyers AS b ON b.id = o.buyer_id
                WHERE b.profile_id = auth.uid()
                  AND o.status = 'PENDING'
            )
            AND crop_listing_id IN (
                SELECT cl.id
                FROM public.crop_listings AS cl
                WHERE cl.status = 'ACTIVE'
            )
        )
        OR public.is_admin()
    );

INSERT INTO storage.buckets (id, name, public)
VALUES ('crop-images', 'crop-images', false);

CREATE POLICY crop_images_select_own_or_admin
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'crop-images'
        AND (
            public.is_admin()
            OR (
                (storage.foldername(name))[1] = auth.uid()::text
                AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
                AND EXISTS (
                    SELECT 1
                    FROM public.crop_listings AS cl
                    JOIN public.farmers AS f ON f.id = cl.farmer_id
                    WHERE cl.id = (storage.foldername(name))[2]::uuid
                      AND f.profile_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY crop_images_insert_own_or_admin
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'crop-images'
        AND (
            public.is_admin()
            OR (
                (storage.foldername(name))[1] = auth.uid()::text
                AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
                AND EXISTS (
                    SELECT 1
                    FROM public.crop_listings AS cl
                    JOIN public.farmers AS f ON f.id = cl.farmer_id
                    WHERE cl.id = (storage.foldername(name))[2]::uuid
                      AND f.profile_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY crop_images_update_own_or_admin
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'crop-images'
        AND (
            public.is_admin()
            OR (
                (storage.foldername(name))[1] = auth.uid()::text
                AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
                AND EXISTS (
                    SELECT 1
                    FROM public.crop_listings AS cl
                    JOIN public.farmers AS f ON f.id = cl.farmer_id
                    WHERE cl.id = (storage.foldername(name))[2]::uuid
                      AND f.profile_id = auth.uid()
                )
            )
        )
    )
    WITH CHECK (
        bucket_id = 'crop-images'
        AND (
            public.is_admin()
            OR (
                (storage.foldername(name))[1] = auth.uid()::text
                AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
                AND EXISTS (
                    SELECT 1
                    FROM public.crop_listings AS cl
                    JOIN public.farmers AS f ON f.id = cl.farmer_id
                    WHERE cl.id = (storage.foldername(name))[2]::uuid
                      AND f.profile_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY crop_images_delete_own_or_admin
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'crop-images'
        AND (
            public.is_admin()
            OR (
                (storage.foldername(name))[1] = auth.uid()::text
                AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
                AND EXISTS (
                    SELECT 1
                    FROM public.crop_listings AS cl
                    JOIN public.farmers AS f ON f.id = cl.farmer_id
                    WHERE cl.id = (storage.foldername(name))[2]::uuid
                      AND f.profile_id = auth.uid()
                )
            )
        )
    );