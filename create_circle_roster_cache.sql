-- Migration: Create circle_roster_cache table
-- Stores cached CCB group participants per circle leader

CREATE TABLE IF NOT EXISTS circle_roster_cache (
  id BIGSERIAL PRIMARY KEY,
  circle_leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  ccb_group_id TEXT NOT NULL,
  ccb_individual_id TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  mobile_phone TEXT DEFAULT '',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(circle_leader_id, ccb_individual_id)
);

-- Index for fast lookups by leader
CREATE INDEX IF NOT EXISTS idx_circle_roster_cache_leader
  ON circle_roster_cache(circle_leader_id);

-- RLS
ALTER TABLE circle_roster_cache ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "Authenticated users can read roster cache"
  ON circle_roster_cache FOR SELECT
  TO authenticated
  USING (true);

-- Allow all authenticated users to insert/update/delete (admin operations)
CREATE POLICY "Authenticated users can manage roster cache"
  ON circle_roster_cache FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE circle_roster_cache IS 'Cached CCB group participants (roster) per circle leader';
COMMENT ON COLUMN circle_roster_cache.fetched_at IS 'When this roster was last fetched from CCB';
