-- Add CCB Group ID field to circle_leaders table
ALTER TABLE circle_leaders 
ADD COLUMN IF NOT EXISTS ccb_group_id TEXT;

-- Add comment for the new field
COMMENT ON COLUMN circle_leaders.ccb_group_id IS 'CCB (Church Community Builder) Group ID for API integration';
