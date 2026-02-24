-- Add ccb_event_ids column to circle_leaders
-- Caches the CCB event IDs for each leader's group so the daily
-- attendance sync never needs to call event_profiles per-leader.
--
-- One-time discovery populates this; daily sync reads it.
-- Format: TEXT[] (array of event ID strings like '{"4959","15521"}')

BEGIN;

ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS ccb_event_ids TEXT[];

-- Index for quick lookup of leaders that still need event ID discovery
CREATE INDEX IF NOT EXISTS idx_leaders_missing_event_ids
  ON circle_leaders(id)
  WHERE ccb_group_id IS NOT NULL AND ccb_event_ids IS NULL;

COMMIT;
