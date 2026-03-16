-- Add repeat/recurrence fields to board_cards
ALTER TABLE board_cards
  ADD COLUMN IF NOT EXISTS repeat_rule TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS repeat_interval INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS repeat_days INTEGER[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS series_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_series_master BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_board_cards_series_id ON board_cards(series_id);
