-- Add automations JSONB column to board_columns
-- Stores an array of ColumnAutomationAction objects that fire
-- automatically whenever a card is moved into the column.
ALTER TABLE board_columns
  ADD COLUMN IF NOT EXISTS automations JSONB NOT NULL DEFAULT '[]'::jsonb;
