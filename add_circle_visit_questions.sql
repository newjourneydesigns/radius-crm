-- Add question fields to circle_visits table for recording visit details
-- These fields capture key information when completing a circle visit

-- Add the three optional question fields
ALTER TABLE circle_visits
  ADD COLUMN IF NOT EXISTS celebrations TEXT,
  ADD COLUMN IF NOT EXISTS observations TEXT,
  ADD COLUMN IF NOT EXISTS next_step TEXT;

-- Update comments
COMMENT ON COLUMN circle_visits.celebrations IS 'What are you celebrating about this leader and/or their Circle?';
COMMENT ON COLUMN circle_visits.observations IS 'What did you see, hear, or experience?';
COMMENT ON COLUMN circle_visits.next_step IS 'My next step to disciple this leader is...';
