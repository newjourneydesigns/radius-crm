-- Indexes for the /today page API queries.
-- These match the multi-column filters used by app/api/today/core and
-- app/api/today/cards so Postgres can avoid scanning whole task/leader tables.

CREATE INDEX IF NOT EXISTS idx_today_circle_visits_scheduled_by_date
  ON public.circle_visits (scheduled_by, visit_date)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_today_encouragements_user_type_date
  ON public.acpd_encouragements (user_id, message_type, message_date)
  WHERE message_type = 'planned';

CREATE INDEX IF NOT EXISTS idx_today_circle_leaders_followups
  ON public.circle_leaders (acpd, follow_up_date)
  WHERE follow_up_required = true;

CREATE INDEX IF NOT EXISTS idx_today_circle_leaders_birthdays
  ON public.circle_leaders (acpd, birthday)
  WHERE birthday IS NOT NULL
    AND birthday <> ''
    AND status NOT IN ('Inactive', 'Removed');

CREATE INDEX IF NOT EXISTS idx_today_notes_created_by_recent
  ON public.notes (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_today_acpd_prayers_user_due
  ON public.acpd_prayer_points (user_id, pray_date)
  WHERE is_answered = false
    AND pray_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_today_general_prayers_user_due
  ON public.general_prayer_points (user_id, pray_date)
  WHERE is_answered = false
    AND pray_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_today_project_boards_active_user_title
  ON public.project_boards (user_id, title)
  WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_today_board_cards_due_by_board
  ON public.board_cards (board_id, due_date)
  WHERE is_complete = false
    AND due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_today_board_cards_incomplete_by_board
  ON public.board_cards (board_id, id)
  WHERE is_complete = false;

CREATE INDEX IF NOT EXISTS idx_today_board_cards_focus_by_board
  ON public.board_cards (board_id, due_date)
  WHERE is_complete = false
    AND is_focused = true;

CREATE INDEX IF NOT EXISTS idx_today_card_assignments_user_card
  ON public.card_assignments (user_id, card_id);

CREATE INDEX IF NOT EXISTS idx_today_card_checklists_due_by_card
  ON public.card_checklists (card_id, due_date)
  WHERE is_completed = false
    AND due_date IS NOT NULL;
