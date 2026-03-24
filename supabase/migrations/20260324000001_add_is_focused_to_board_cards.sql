-- Add is_focused flag to board_cards
-- Allows users to mark any card as a Focus card, which surfaces it on the Today page
ALTER TABLE board_cards ADD COLUMN IF NOT EXISTS is_focused boolean DEFAULT false;
