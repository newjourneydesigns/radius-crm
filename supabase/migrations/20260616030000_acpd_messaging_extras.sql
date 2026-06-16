-- ============================================================================
-- ACPD messaging extras: edit, pin, mute, and @mentions
--
--   • acpd_messages: edited_at + pinned_at/pinned_by for edit + pin.
--   • acpd_conversation_members: per-member mute (silences message push; an
--     @mention still notifies you).
--   • notifications: a new 'mention' type + notify_mentions preference so an
--     @mention in a thread lands in your inbox and pushes to your phone.
-- ============================================================================

-- ── Edit + pin on messages ──────────────────────────────────────────────────
ALTER TABLE public.acpd_messages
  ADD COLUMN IF NOT EXISTS edited_at  timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_at  timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by  uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS acpd_messages_pinned_idx
  ON public.acpd_messages (conversation_id)
  WHERE pinned_at IS NOT NULL;

-- ── Per-member conversation mute ────────────────────────────────────────────
ALTER TABLE public.acpd_conversation_members
  ADD COLUMN IF NOT EXISTS muted boolean NOT NULL DEFAULT false;

-- ── @mentions ride the inbox notification system ────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'message', 'mention', 'card_assignment', 'card_comment',
  'board_share', 'notebook_share', 'birthday', 'follow_up'
));

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS notify_mentions boolean NOT NULL DEFAULT true;

-- Map the new 'mention' type to its preference column.
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
    WHEN 'mention'         THEN notify_mentions
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

-- 'message' notifications still push instantly from the message API; 'mention'
-- notifications go through the push dispatcher (so they bypass conversation mute).
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

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN RETURN; END IF;
  IF NOT public.notif_pref_enabled(p_user_id, p_type) THEN RETURN; END IF;

  IF p_actor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id) THEN
    p_actor_id := NULL;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link, actor_id, entity_type, entity_id, push_sent_at)
  VALUES (
    p_user_id, p_type, p_title, p_body, p_link, p_actor_id, p_entity_type, p_entity_id,
    CASE WHEN p_type = 'message' THEN now() ELSE NULL END
  );
END;
$fn$;
