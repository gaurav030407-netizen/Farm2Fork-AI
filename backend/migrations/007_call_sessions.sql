CREATE TABLE public.call_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id uuid NOT NULL REFERENCES public.buyers (id) ON DELETE CASCADE,
    farmer_id uuid NOT NULL REFERENCES public.farmers (id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
    status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    ended_at timestamptz,
    ended_by uuid,
    CONSTRAINT call_sessions_status_check CHECK (status IN ('RINGING', 'ACCEPTED', 'ACTIVE', 'DECLINED', 'ENDED', 'EXPIRED')),
    CONSTRAINT call_sessions_ended_by_check CHECK (ended_at IS NULL OR ended_by IS NOT NULL)
);

CREATE FUNCTION public.validate_call_session_participants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.orders AS o
        WHERE o.id = NEW.order_id
          AND o.buyer_id = NEW.buyer_id
          AND o.farmer_id = NEW.farmer_id
    ) THEN
        RAISE EXCEPTION 'Call participants must match the order participants';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER call_sessions_validate_participants
    BEFORE INSERT OR UPDATE ON public.call_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_call_session_participants();

CREATE INDEX call_sessions_buyer_id_idx
    ON public.call_sessions (buyer_id);

CREATE INDEX call_sessions_farmer_id_idx
    ON public.call_sessions (farmer_id);

CREATE INDEX call_sessions_order_id_idx
    ON public.call_sessions (order_id);

CREATE INDEX call_sessions_status_idx
    ON public.call_sessions (status);

CREATE INDEX call_sessions_expires_at_idx
    ON public.call_sessions (expires_at);

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY call_sessions_select_participant_or_admin
    ON public.call_sessions
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

CREATE POLICY call_sessions_insert_buyer_or_admin
    ON public.call_sessions
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
            AND status = 'RINGING'
        )
        OR public.is_admin()
    );

CREATE POLICY call_sessions_update_participant_or_admin
    ON public.call_sessions
    FOR UPDATE
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
    )
    WITH CHECK (
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

GRANT SELECT, INSERT, UPDATE
    ON public.call_sessions
    TO authenticated;
