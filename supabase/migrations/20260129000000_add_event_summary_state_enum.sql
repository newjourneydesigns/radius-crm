-- Migration to add event_summary_state enum column
-- This replaces the boolean flags with a proper enum type

-- Create the enum type
CREATE TYPE event_summary_status AS ENUM ('not_received', 'received', 'did_not_meet', 'skipped');

-- Add the new column
ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS event_summary_state event_summary_status DEFAULT 'not_received';

-- Migrate existing data from boolean flags to the new enum
UPDATE circle_leaders
SET event_summary_state = CASE
  WHEN event_summary_received = TRUE THEN 'received'::event_summary_status
  WHEN event_summary_skipped = TRUE THEN 'did_not_meet'::event_summary_status
  ELSE 'not_received'::event_summary_status
END;

-- Set NOT NULL constraint after migration
ALTER TABLE circle_leaders
  ALTER COLUMN event_summary_state SET NOT NULL;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_circle_leaders_event_summary_state 
  ON circle_leaders(event_summary_state);

-- We'll keep the old columns for now for backwards compatibility
-- They can be removed in a future migration after confirming everything works
-- For now, create a trigger to keep them in sync

CREATE OR REPLACE FUNCTION sync_event_summary_flags()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the boolean flags based on the state
  NEW.event_summary_received := (NEW.event_summary_state = 'received');
  NEW.event_summary_skipped := (NEW.event_summary_state IN ('did_not_meet', 'skipped'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_event_summary_flags_trigger
  BEFORE INSERT OR UPDATE OF event_summary_state
  ON circle_leaders
  FOR EACH ROW
  EXECUTE FUNCTION sync_event_summary_flags();

-- Add comment explaining the new column
COMMENT ON COLUMN circle_leaders.event_summary_state IS 'Event summary status: not_received (default/red), received (green), did_not_meet (blue), skipped (yellow)';
