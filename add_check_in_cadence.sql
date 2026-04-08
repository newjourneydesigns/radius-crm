-- Add check-in cadence tracking columns to circle_leaders
ALTER TABLE circle_leaders 
  ADD COLUMN IF NOT EXISTS check_in_cadence TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_check_in_date DATE;

-- Add a comment for clarity
COMMENT ON COLUMN circle_leaders.check_in_cadence IS 'Target contact frequency: weekly, bi-weekly, monthly, quarterly, none';
COMMENT ON COLUMN circle_leaders.last_check_in_date IS 'Date of most recent check-in (auto-updated when connections are logged)';
