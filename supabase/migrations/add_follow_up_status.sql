-- Migration to add 'follow-up' to the status CHECK constraint
-- Date: July 30, 2025
-- Description: Adds 'follow-up' as a valid status option for circle_leaders table

-- Drop the existing CHECK constraint
ALTER TABLE circle_leaders DROP CONSTRAINT IF EXISTS circle_leaders_status_check;

-- Add the new CHECK constraint with 'follow-up' included
ALTER TABLE circle_leaders ADD CONSTRAINT circle_leaders_status_check 
    CHECK (status = ANY (ARRAY['invited'::text, 'pipeline'::text, 'follow-up'::text, 'active'::text, 'paused'::text, 'off-boarding'::text]));

-- Add a comment to document the change
COMMENT ON CONSTRAINT circle_leaders_status_check ON circle_leaders IS 'Valid status values: invited, pipeline, follow-up, active, paused, off-boarding';
