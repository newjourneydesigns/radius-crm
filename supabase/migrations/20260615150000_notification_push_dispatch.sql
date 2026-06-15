-- ============================================================================
-- Inbox push dispatch
--
-- Notifications created by DB triggers + the daily-alerts cron don't go through
-- a Node choke point, so they can't send Web Push inline. Instead we mark each
-- row's push state and a frequent scheduled job (dispatch-push) fans out push
-- for the unpushed ones.
--
-- Team messages are excluded: they already push instantly from the message API,
-- so create_notification stamps push_sent_at on 'message' rows at insert time.
-- ============================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

-- The dispatcher scans for rows still needing a push.
CREATE INDEX IF NOT EXISTS notifications_push_pending_idx
  ON public.notifications (created_at)
  WHERE push_sent_at IS NULL;

-- Anything that already exists predates push dispatch — mark it handled so the
-- first dispatcher run doesn't backfill a flood of pushes.
UPDATE public.notifications SET push_sent_at = now() WHERE push_sent_at IS NULL;

-- Stamp 'message' notifications as already-pushed (they push instantly via the
-- message API), and leave every other type for the dispatcher.
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
AS $$
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
$$;
