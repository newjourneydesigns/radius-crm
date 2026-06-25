-- Add source group tracking to follow_up_campaign_people.
-- Populated during reconcile so the detail page can show and filter by group.
ALTER TABLE follow_up_campaign_people
  ADD COLUMN IF NOT EXISTS source_group_id   TEXT,
  ADD COLUMN IF NOT EXISTS source_group_name TEXT;
