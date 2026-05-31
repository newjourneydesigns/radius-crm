ALTER TABLE public.board_cards
  ADD COLUMN IF NOT EXISTS due_time time;
