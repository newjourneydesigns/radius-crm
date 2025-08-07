-- Add missing follow_up_required column to circle_leaders table
-- This column is referenced in the application but missing from the schema

ALTER TABLE circle_leaders 
ADD COLUMN IF NOT EXISTS follow_up_required boolean DEFAULT false;

-- Update existing records to have follow_up_required = true where follow_up_date is set
UPDATE circle_leaders 
SET follow_up_required = true 
WHERE follow_up_date IS NOT NULL;

-- Verify the change
SELECT id, name, follow_up_required, follow_up_date, ccb_profile_link 
FROM circle_leaders 
WHERE ccb_profile_link IS NOT NULL 
LIMIT 5;
