-- Migration to modify follow-up functionality
-- Date: August 4, 2025
-- Description: Changes follow-up from a status to a separate boolean flag that can be combined with any status

-- Add a new boolean column for follow_up_required
ALTER TABLE circle_leaders ADD COLUMN follow_up_required boolean DEFAULT false;

-- Update existing records that have 'follow-up' status
UPDATE circle_leaders 
SET follow_up_required = true, 
    status = 'active'  -- Set to a default status, can be manually adjusted
WHERE status = 'follow-up';

-- Remove 'follow-up' from the status constraint
ALTER TABLE circle_leaders DROP CONSTRAINT IF EXISTS circle_leaders_status_check;

-- Add the new CHECK constraint without 'follow-up'
ALTER TABLE circle_leaders ADD CONSTRAINT circle_leaders_status_check 
    CHECK (status = ANY (ARRAY['invited'::text, 'pipeline'::text, 'active'::text, 'paused'::text, 'off-boarding'::text]));

-- Add comment to document the change
COMMENT ON COLUMN circle_leaders.follow_up_required IS 'Boolean flag indicating if this leader requires follow-up, can be combined with any status';
COMMENT ON CONSTRAINT circle_leaders_status_check ON circle_leaders IS 'Valid status values: invited, pipeline, active, paused, off-boarding (follow-up is now a separate boolean flag)';
