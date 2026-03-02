-- Add birthday column to circle_leaders table
-- Run this in Supabase SQL Editor

ALTER TABLE circle_leaders ADD COLUMN IF NOT EXISTS birthday TEXT DEFAULT NULL;

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'circle_leaders' AND column_name = 'birthday';
