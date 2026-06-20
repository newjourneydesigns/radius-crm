CREATE TABLE IF NOT EXISTS host_team_positions (
  id BIGSERIAL PRIMARY KEY,
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  ccb_position_id TEXT NOT NULL,
  ccb_team_id TEXT NOT NULL,
  position_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE host_team_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read host_team_positions"
  ON host_team_positions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert host_team_positions"
  ON host_team_positions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete host_team_positions"
  ON host_team_positions FOR DELETE TO authenticated USING (true);
