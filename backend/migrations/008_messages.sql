CREATE TABLE public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id uuid NOT NULL REFERENCES public.buyers (id) ON DELETE CASCADE,
    farmer_id uuid NOT NULL REFERENCES public.farmers (id) ON DELETE CASCADE,
    order_id uuid NOT NULL UNIQUE REFERENCES public.orders (id) ON DELETE CASCADE,
    crop_listing_id uuid REFERENCES public.crop_listings (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT conversations_order_participants_match CHECK (buyer_id IS NOT NULL AND farmer_id IS NOT NULL)
);

CREATE TABLE public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    receiver_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
    crop_listing_id uuid REFERENCES public.crop_listings (id) ON DELETE SET NULL,
    content text NOT NULL,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    CONSTRAINT messages_content_check CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000),
    CONSTRAINT messages_participants_distinct CHECK (sender_id <> receiver_id)
);

CREATE INDEX conversations_buyer_id_idx ON public.conversations (buyer_id);
CREATE INDEX conversations_farmer_id_idx ON public.conversations (farmer_id);
CREATE INDEX conversations_updated_at_idx ON public.conversations (updated_at DESC);
CREATE INDEX messages_conversation_created_at_idx ON public.messages (conversation_id, created_at);
CREATE INDEX messages_sender_id_idx ON public.messages (sender_id);
CREATE INDEX messages_receiver_id_idx ON public.messages (receiver_id);
CREATE INDEX messages_unread_idx ON public.messages (receiver_id, is_read, created_at)
    WHERE is_read = false;

CREATE TRIGGER conversations_set_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select_participant
    ON public.conversations FOR SELECT TO authenticated
    USING (
        buyer_id IN (SELECT id FROM public.buyers WHERE profile_id = auth.uid())
        OR farmer_id IN (SELECT id FROM public.farmers WHERE profile_id = auth.uid())
    );

CREATE POLICY conversations_insert_participant
    ON public.conversations FOR INSERT TO authenticated
    WITH CHECK (
        buyer_id IN (SELECT id FROM public.buyers WHERE profile_id = auth.uid())
        OR farmer_id IN (SELECT id FROM public.farmers WHERE profile_id = auth.uid())
    );

CREATE POLICY messages_select_participant
    ON public.messages FOR SELECT TO authenticated
    USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY messages_insert_sender
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (sender_id = auth.uid());

CREATE POLICY messages_update_receiver
    ON public.messages FOR UPDATE TO authenticated
    USING (receiver_id = auth.uid())
    WITH CHECK (receiver_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
