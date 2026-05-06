-- Add optional supporting text for checklist items.
-- Used by AI-generated card checklist items to preserve source context
-- beneath the concise task title.
ALTER TABLE card_checklists
  ADD COLUMN IF NOT EXISTS description text;
