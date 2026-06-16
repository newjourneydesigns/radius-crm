-- ============================================================================
-- ACPD messaging: group threads + message reactions (likes)
--
--   • Allow 'group' conversations (3+ members) alongside 'channel' and 'dm'.
--   • Add a reactions table so members can ❤️ a message.
--   • Realtime: stream reaction + message-delete events to members. REPLICA
--     IDENTITY FULL so DELETE events carry the columns RLS needs to authorize
--     delivery (conversation_id on messages, message_id on reactions).
-- ============================================================================

-- ── Allow group conversations ───────────────────────────────────────────────
ALTER TABLE public.acpd_conversations DROP CONSTRAINT IF EXISTS acpd_conversations_kind_check;
ALTER TABLE public.acpd_conversations
  ADD CONSTRAINT acpd_conversations_kind_check CHECK (kind IN ('channel', 'dm', 'group'));

-- ── Message reactions (one 💚 like per user per message for now) ─────────────
CREATE TABLE IF NOT EXISTS public.acpd_message_reactions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid        NOT NULL REFERENCES public.acpd_messages(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji      text        NOT NULL DEFAULT '💚',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS acpd_message_reactions_message_idx
  ON public.acpd_message_reactions (message_id);

ALTER TABLE public.acpd_message_reactions ENABLE ROW LEVEL SECURITY;

-- Members of the conversation can read its reactions (for counts + realtime).
-- Writes go through the service-role server route, so there's no client write policy.
DROP POLICY IF EXISTS "Members can view reactions" ON public.acpd_message_reactions;
CREATE POLICY "Members can view reactions"
  ON public.acpd_message_reactions FOR SELECT TO authenticated
  USING (
    public.acpd_is_conversation_member(
      (SELECT conversation_id FROM public.acpd_messages WHERE id = message_id)
    )
  );

-- ── Realtime delivery for deletes needs the full old row for RLS checks ──────
ALTER TABLE public.acpd_messages          REPLICA IDENTITY FULL;
ALTER TABLE public.acpd_message_reactions REPLICA IDENTITY FULL;

DO $do$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['acpd_message_reactions']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $do$;
