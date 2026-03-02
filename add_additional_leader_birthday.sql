-- Add birthday column for additional leaders
-- Run this in Supabase SQL Editor

ALTER TABLE circle_leaders ADD COLUMN IF NOT EXISTS additional_leader_birthday TEXT DEFAULT NULL;

COMMENT ON COLUMN circle_leaders.additional_leader_birthday IS 'Birthday of additional leader / co-leader / spouse (YYYY-MM-DD)';

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'circle_leaders' AND column_name = 'additional_leader_birthday';
