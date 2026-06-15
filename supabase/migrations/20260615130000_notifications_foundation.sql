-- ============================================================================
-- Radius User Inbox — unified notifications
--
-- A per-user activity inbox that aggregates events from across Radius (new
-- team messages, card assignments, card comments, board/notebook shares, and
-- birthday / follow-up alerts). Producers insert rows via the create_notification
-- helper (called from DB triggers + scheduled jobs); each user reads, filters,
-- marks read/unread, archives, and deletes their own items directly from the
-- browser under RLS, and Realtime keeps the unread badge live.
--
-- This migration sets up the foundation (tables, prefs, helpers, RLS, realtime).
-- The per-source triggers live in a follow-up migration.
-- ============================================================================

-- ── Notifications ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type        text        NOT NULL CHECK (type IN (
                            'message', 'card_assignment', 'card_comment',
                            'board_share', 'notebook_share', 'birthday', 'follow_up'
                          )),
  title       text        NOT NULL,
  body        text,
  link        text,
  actor_id    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  entity_type text,
  entity_id   text,
  read_at     timestamptz,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Inbox list (newest first, non-archived) and unread-count lookups.
CREATE INDEX IF NOT EXISTS notifications_user_inbox_idx
  ON public.notifications (user_id, archived_at, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, read_at);

-- ── Per-user delivery preferences (one row per user; defaults all on) ────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id               uuid        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  notify_messages       boolean     NOT NULL DEFAULT true,
  notify_card_assignments boolean   NOT NULL DEFAULT true,
  notify_card_comments  boolean     NOT NULL DEFAULT true,
  notify_board_shares   boolean     NOT NULL DEFAULT true,
  notify_notebook_shares boolean    NOT NULL DEFAULT true,
  notify_birthdays      boolean     NOT NULL DEFAULT true,
  notify_follow_ups     boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- Whether a user wants a given notification type (defaults to true when the
-- user has no preferences row yet).
CREATE OR REPLACE FUNCTION public.notif_pref_enabled(p_user_id uuid, p_type text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v boolean;
BEGIN
  SELECT CASE p_type
    WHEN 'message'         THEN notify_messages
    WHEN 'card_assignment' THEN notify_card_assignments
    WHEN 'card_comment'    THEN notify_card_comments
    WHEN 'board_share'     THEN notify_board_shares
    WHEN 'notebook_share'  THEN notify_notebook_shares
    WHEN 'birthday'        THEN notify_birthdays
    WHEN 'follow_up'       THEN notify_follow_ups
    ELSE true
  END
  INTO v
  FROM public.notification_preferences
  WHERE user_id = p_user_id;

  RETURN COALESCE(v, true);
END;
$fn$;

-- Insert a notification, honouring the recipient's preferences and never
-- notifying someone about their own action. Producers (triggers / cron) call
-- this so the policy lives in one place.
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id     uuid,
  p_type        text,
  p_title       text,
  p_body        text,
  p_link        text,
  p_actor_id    uuid,
  p_entity_type text,
  p_entity_id   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  IF p_actor_id IS NOT NULL AND p_actor_id = p_user_id THEN RETURN; END IF;

  -- The recipient must have a public.users profile (notifications FK to it).
  -- Skip silently rather than raise — a missing profile must never roll back
  -- the source action (assigning a card, sharing a board, etc.).
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN RETURN; END IF;
  IF NOT public.notif_pref_enabled(p_user_id, p_type) THEN RETURN; END IF;

  -- Don't let a missing actor profile break the FK either.
  IF p_actor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id) THEN
    p_actor_id := NULL;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link, actor_id, entity_type, entity_id)
  VALUES (p_user_id, p_type, p_title, p_body, p_link, p_actor_id, p_entity_type, p_entity_id);
END;
$fn$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users see and manage only their own notifications. Inserts happen through the
-- SECURITY DEFINER create_notification helper, so there is no client INSERT policy.
DROP POLICY IF EXISTS "Users read their own notifications" ON public.notifications;
CREATE POLICY "Users read their own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update their own notifications" ON public.notifications;
CREATE POLICY "Users update their own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete their own notifications" ON public.notifications;
CREATE POLICY "Users delete their own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Users fully manage their own preferences row.
DROP POLICY IF EXISTS "Users manage their own notification prefs" ON public.notification_preferences;
CREATE POLICY "Users manage their own notification prefs"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Realtime: stream new notifications to the inbox + nav badge ─────────────
DO $do$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['notifications']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $do$;
