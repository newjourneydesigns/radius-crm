-- Migration: Add birthday column to circle_roster_cache
-- Stores birthday from CCB individual profile enrichment

ALTER TABLE circle_roster_cache
ADD COLUMN IF NOT EXISTS birthday TEXT DEFAULT '';

COMMENT ON COLUMN circle_roster_cache.birthday IS 'Birthday from CCB individual profile (YYYY-MM-DD format)';
