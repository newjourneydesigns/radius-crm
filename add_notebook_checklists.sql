-- Add checklists JSONB column to notebook_pages
-- Each page can have multiple named checklists, stored as:
-- [{ id, title, items: [{ id, text, checked }] }]

ALTER TABLE notebook_pages
  ADD COLUMN IF NOT EXISTS checklists jsonb NOT NULL DEFAULT '[]'::jsonb;
