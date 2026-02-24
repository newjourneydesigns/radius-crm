-- Add a partial unique constraint on ccb_group_id to prevent duplicate imports
-- This only applies to non-null values, so existing rows without a ccb_group_id are unaffected.
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- Create the partial unique index (idempotent — IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS circle_leaders_ccb_group_id_unique
  ON circle_leaders (ccb_group_id)
  WHERE ccb_group_id IS NOT NULL;

-- Done! Duplicate CCB group imports are now prevented at the database level.
