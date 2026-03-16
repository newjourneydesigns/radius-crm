-- Add is_complete column to board_cards
-- When true, the card is marked as done and will be excluded from due/overdue notifications
ALTER TABLE board_cards ADD COLUMN IF NOT EXISTS is_complete boolean NOT NULL DEFAULT false;
