-- Add optional URL to checklist items for clickable links
ALTER TABLE card_checklists ADD COLUMN IF NOT EXISTS url text;
