-- Add host team leader support to circle_leaders
ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS leader_type TEXT NOT NULL DEFAULT 'circle'
    CHECK (leader_type IN ('circle', 'host_team')),
  ADD COLUMN IF NOT EXISTS team_name TEXT,
  ADD COLUMN IF NOT EXISTS director TEXT;

CREATE INDEX IF NOT EXISTS idx_circle_leaders_leader_type ON circle_leaders(leader_type);

-- Directors list for host team leader oversight (separate from acpd_list)
CREATE TABLE IF NOT EXISTS directors_list (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE directors_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view directors_list"
  ON directors_list FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert directors_list"
  ON directors_list FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update directors_list"
  ON directors_list FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete directors_list"
  ON directors_list FOR DELETE TO authenticated USING (true);
