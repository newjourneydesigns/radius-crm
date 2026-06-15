-- ============================================================================
-- ACPD Team Messaging
--
-- Lets the team of ACPDs message each other inside RADIUS — one shared team
-- channel everyone belongs to, plus private 1-on-1 direct messages between any
-- two ACPDs.
--
-- Access model:
--   • Only ACPD / admin users participate (enforced in the server routes that
--     create memberships, and by the is_acpd_user() helper here).
--   • Members read their conversations + messages directly from the browser via
--     RLS (so Supabase Realtime can stream new messages to them).
--   • All writes (sending messages, creating DMs, joining the channel) go
--     through server routes using the service-role client, which bumps
--     last_message_at and fans out Web Push — so there are no browser INSERT
--     policies on conversations or messages.
-- ============================================================================

-- ── Conversations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acpd_conversations (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  kind            text        NOT NULL CHECK (kind IN ('channel', 'dm')),
  title           text,
  created_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Membership (one row per user per conversation) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.acpd_conversation_members (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid        NOT NULL REFERENCES public.acpd_conversations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT to_timestamp(0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS acpd_conversation_members_user_idx
  ON public.acpd_conversation_members (user_id);
CREATE INDEX IF NOT EXISTS acpd_conversation_members_conversation_idx
  ON public.acpd_conversation_members (conversation_id);

-- ── Messages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acpd_messages (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid        NOT NULL REFERENCES public.acpd_conversations(id) ON DELETE CASCADE,
  sender_id       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  body            text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acpd_messages_conversation_idx
  ON public.acpd_messages (conversation_id, created_at DESC);

-- ── Seed the single shared team channel ─────────────────────────────────────
INSERT INTO public.acpd_conversations (kind, title)
SELECT 'channel', 'ACPD Team'
WHERE NOT EXISTS (SELECT 1 FROM public.acpd_conversations WHERE kind = 'channel');

-- ── Access helpers ──────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can reference them without recursing between
-- conversations / members / messages.

CREATE OR REPLACE FUNCTION public.is_acpd_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'ACPD'
  );
$$;

CREATE OR REPLACE FUNCTION public.acpd_is_conversation_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.acpd_conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_acpd_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.acpd_is_conversation_member(uuid) TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.acpd_conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acpd_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acpd_messages             ENABLE ROW LEVEL SECURITY;

-- Conversations: visible to their members.
DROP POLICY IF EXISTS "Members can view conversations" ON public.acpd_conversations;
CREATE POLICY "Members can view conversations"
  ON public.acpd_conversations FOR SELECT TO authenticated
  USING (public.acpd_is_conversation_member(id));

-- Members: a user can see their own membership rows and those of anyone in a
-- conversation they belong to (needed to render DM participants).
DROP POLICY IF EXISTS "Members can view conversation members" ON public.acpd_conversation_members;
CREATE POLICY "Members can view conversation members"
  ON public.acpd_conversation_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.acpd_is_conversation_member(conversation_id));

-- Members: a user may update only their own membership row (to advance
-- last_read_at as they read a conversation).
DROP POLICY IF EXISTS "Members can update their own membership" ON public.acpd_conversation_members;
CREATE POLICY "Members can update their own membership"
  ON public.acpd_conversation_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Messages: visible to members of the conversation. Inserts happen only via the
-- service-role server route (so it can fan out push + bump last_message_at).
DROP POLICY IF EXISTS "Members can view messages" ON public.acpd_messages;
CREATE POLICY "Members can view messages"
  ON public.acpd_messages FOR SELECT TO authenticated
  USING (public.acpd_is_conversation_member(conversation_id));

-- ── Realtime: stream new messages + read receipts to members ────────────────
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'acpd_messages',
    'acpd_conversation_members'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
