ALTER TABLE public.conversations
    ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.messages
    ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.conversations
    DROP CONSTRAINT IF EXISTS conversations_order_id_key;

DO $$
DECLARE
    duplicate_row RECORD;
BEGIN
    FOR duplicate_row IN
        SELECT duplicate.id, keeper.id AS keeper_id
        FROM public.conversations duplicate
        JOIN public.conversations keeper
          ON keeper.buyer_id = duplicate.buyer_id
         AND keeper.farmer_id = duplicate.farmer_id
         AND (keeper.created_at, keeper.id) < (duplicate.created_at, duplicate.id)
    LOOP
        UPDATE public.messages
        SET conversation_id = duplicate_row.keeper_id
        WHERE conversation_id = duplicate_row.id;
        DELETE FROM public.conversations WHERE id = duplicate_row.id;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_buyer_farmer_unique_idx
    ON public.conversations (buyer_id, farmer_id);

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
    message_id uuid NOT NULL UNIQUE REFERENCES public.messages (id) ON DELETE CASCADE,
    type text NOT NULL DEFAULT 'MESSAGE',
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    CONSTRAINT notifications_type_check CHECK (type = 'MESSAGE')
);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
    ON public.notifications (recipient_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_recipient ON public.notifications;
CREATE POLICY notifications_select_recipient
    ON public.notifications FOR SELECT TO authenticated
    USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_recipient ON public.notifications;
CREATE POLICY notifications_update_recipient
    ON public.notifications FOR UPDATE TO authenticated
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

GRANT SELECT, UPDATE ON public.notifications TO authenticated;