-- Add 'on-boarding' to the allowed status values
-- Date: January 26, 2026

ALTER TABLE circle_leaders DROP CONSTRAINT IF EXISTS circle_leaders_status_check;

ALTER TABLE circle_leaders ADD CONSTRAINT circle_leaders_status_check 
    CHECK (status = ANY (ARRAY['invited'::text, 'pipeline'::text, 'on-boarding'::text, 'active'::text, 'paused'::text, 'off-boarding'::text]));

COMMENT ON CONSTRAINT circle_leaders_status_check ON circle_leaders IS 'Valid status values: invited, pipeline, on-boarding, active, paused, off-boarding';
