-- Add circle_name as the primary identifier for a circle (sourced from CCB group title)
-- Add per-leader CCB individual profile links (separate from the circle group link)
ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS circle_name TEXT,
  ADD COLUMN IF NOT EXISTS leader_ccb_profile_link TEXT,
  ADD COLUMN IF NOT EXISTS additional_leader_ccb_profile_link TEXT;

-- Seed circle_name from the leader name for all existing records
-- This acts as a fallback until CCB sync overwrites it with the real group title
UPDATE circle_leaders
  SET circle_name = name
  WHERE circle_name IS NULL OR circle_name = '';