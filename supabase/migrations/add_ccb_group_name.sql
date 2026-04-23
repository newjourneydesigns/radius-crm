-- Add ccb_group_name to circle_leaders
-- Used when a leader has multiple CCB circles and we need to specify
-- the exact CCB group name to match against (e.g. "LVT | S1 | Todd Baden").
-- Falls back to leader.name when null.
ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS ccb_group_name text;
