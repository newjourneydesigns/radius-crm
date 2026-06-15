-- ============================================================================
-- Notification producers — DB triggers
--
-- Most of these source mutations happen client-side via direct Supabase calls
-- (no single server choke point), so triggers are the robust place to emit
-- inbox notifications. Each trigger function is SECURITY DEFINER (reads source
-- rows freely, inserts via create_notification, which itself honours the
-- recipient's preferences and skips self-actions). Birthday / follow-up alerts
-- are time-based and handled by a scheduled job instead.
-- ============================================================================

-- ── Card assigned → notify the assignee ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_card_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_board uuid;
BEGIN
  SELECT title, board_id INTO v_title, v_board FROM public.board_cards WHERE id = NEW.card_id;
  PERFORM public.create_notification(
    NEW.user_id,
    'card_assignment',
    'You were assigned a card',
    COALESCE(v_title, 'A card'),
    '/boards/' || v_board::text || '?card=' || NEW.card_id::text,
    NEW.assigned_by,
    'card',
    NEW.card_id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_card_assignment ON public.card_assignments;
CREATE TRIGGER trg_notify_card_assignment
  AFTER INSERT ON public.card_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_card_assignment();

-- ── Card comment → notify the board owner + the card's assignees ────────────
CREATE OR REPLACE FUNCTION public.notify_on_card_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title     text;
  v_board     uuid;
  v_owner     uuid;
  v_recipient uuid;
  v_link      text;
BEGIN
  SELECT title, board_id INTO v_title, v_board FROM public.board_cards WHERE id = NEW.card_id;
  SELECT user_id INTO v_owner FROM public.project_boards WHERE id = v_board;
  v_link := '/boards/' || v_board::text || '?card=' || NEW.card_id::text;

  FOR v_recipient IN
    SELECT DISTINCT uid FROM (
      SELECT v_owner AS uid
      UNION
      SELECT user_id FROM public.card_assignments WHERE card_id = NEW.card_id
    ) r
    WHERE uid IS NOT NULL AND uid <> NEW.user_id
  LOOP
    PERFORM public.create_notification(
      v_recipient,
      'card_comment',
      'New comment on ' || COALESCE(v_title, 'a card'),
      LEFT(NEW.content, 140),
      v_link,
      NEW.user_id,
      'card',
      NEW.card_id::text
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_card_comment ON public.card_comments;
CREATE TRIGGER trg_notify_card_comment
  AFTER INSERT ON public.card_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_card_comment();

-- ── Board shared → notify the new member ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_board_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  SELECT title INTO v_title FROM public.project_boards WHERE id = NEW.board_id;
  PERFORM public.create_notification(
    NEW.user_id,
    'board_share',
    'A board was shared with you',
    COALESCE(v_title, 'A board'),
    '/boards/' || NEW.board_id::text,
    NEW.added_by,
    'board',
    NEW.board_id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_board_share ON public.board_members;
CREATE TRIGGER trg_notify_board_share
  AFTER INSERT ON public.board_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_board_share();

-- ── Notebook page shared → notify the recipient ─────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_notebook_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  SELECT title INTO v_title FROM public.notebook_pages WHERE id = NEW.page_id;
  PERFORM public.create_notification(
    NEW.user_id,
    'notebook_share',
    'A notebook page was shared with you',
    COALESCE(v_title, 'Untitled'),
    '/notebook',
    NEW.shared_by,
    'notebook_page',
    NEW.page_id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_notebook_share ON public.notebook_page_shares;
CREATE TRIGGER trg_notify_notebook_share
  AFTER INSERT ON public.notebook_page_shares
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_notebook_share();

-- ── New team message → notify the other conversation members ────────────────
CREATE OR REPLACE FUNCTION public.notify_on_acpd_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind      text;
  v_sender    text;
  v_recipient uuid;
  v_title     text;
BEGIN
  SELECT kind INTO v_kind FROM public.acpd_conversations WHERE id = NEW.conversation_id;
  SELECT name INTO v_sender FROM public.users WHERE id = NEW.sender_id;

  FOR v_recipient IN
    SELECT user_id FROM public.acpd_conversation_members
    WHERE conversation_id = NEW.conversation_id AND user_id <> NEW.sender_id
  LOOP
    v_title := CASE
      WHEN v_kind = 'channel' THEN 'ACPD Team · ' || COALESCE(v_sender, 'New message')
      ELSE COALESCE(v_sender, 'New message')
    END;
    PERFORM public.create_notification(
      v_recipient,
      'message',
      v_title,
      LEFT(NEW.body, 140),
      '/messages',
      NEW.sender_id,
      'conversation',
      NEW.conversation_id::text
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_acpd_message ON public.acpd_messages;
CREATE TRIGGER trg_notify_acpd_message
  AFTER INSERT ON public.acpd_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_acpd_message();
