-- Add due_date column to card_checklists
ALTER TABLE card_checklists ADD COLUMN IF NOT EXISTS due_date date;
