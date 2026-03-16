-- ============================================================
-- Add board-related email preference columns to users table
-- ============================================================

-- New board card/checklist email preferences
ALTER TABLE users ADD COLUMN IF NOT EXISTS include_board_cards_owned boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS include_board_cards_assigned boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS include_checklist_items boolean DEFAULT true;
