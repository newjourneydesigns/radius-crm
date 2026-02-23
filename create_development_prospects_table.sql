-- Development Prospects table
-- Tracks people identified by a Circle Leader to be developed as future leaders

CREATE TABLE IF NOT EXISTS development_prospects (
  id SERIAL PRIMARY KEY,
  circle_leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_development_prospects_leader ON development_prospects(circle_leader_id);
CREATE INDEX IF NOT EXISTS idx_development_prospects_user ON development_prospects(user_id);

-- Enable RLS
ALTER TABLE development_prospects ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "development_prospects_select" ON development_prospects
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "development_prospects_insert" ON development_prospects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "development_prospects_update" ON development_prospects
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "development_prospects_delete" ON development_prospects
  FOR DELETE USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_development_prospects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_development_prospects_updated_at
  BEFORE UPDATE ON development_prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_development_prospects_updated_at();
