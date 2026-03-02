-- Add include_birthdays email preference column to users table
-- Run this in Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS include_birthdays BOOLEAN DEFAULT TRUE;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'include_birthdays';
