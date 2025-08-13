-- Create circle_visits table for tracking Circle Visits
CREATE TABLE IF NOT EXISTS circle_visits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'canceled')),
  scheduled_by TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  canceled_at TIMESTAMPTZ,
  canceled_by TEXT,
  cancel_reason TEXT,
  previsit_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_circle_visits_leader_id ON circle_visits(leader_id);
CREATE INDEX IF NOT EXISTS idx_circle_visits_visit_date ON circle_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_circle_visits_status ON circle_visits(status);
CREATE INDEX IF NOT EXISTS idx_circle_visits_scheduled_leader ON circle_visits(leader_id, status, visit_date) WHERE status = 'scheduled';

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_circle_visits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_circle_visits_updated_at
  BEFORE UPDATE ON circle_visits
  FOR EACH ROW
  EXECUTE FUNCTION update_circle_visits_updated_at();

-- RLS Policies
ALTER TABLE circle_visits ENABLE ROW LEVEL SECURITY;

-- Directors can manage visits for leaders they have access to
CREATE POLICY "Directors can manage circle visits" ON circle_visits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM circle_leaders cl 
      WHERE cl.id = circle_visits.leader_id
      -- Add your director access logic here based on your auth system
    )
  );

-- Viewers can read visits for leaders they have access to
CREATE POLICY "Viewers can read circle visits" ON circle_visits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM circle_leaders cl 
      WHERE cl.id = circle_visits.leader_id
      -- Add your viewer access logic here based on your auth system
    )
  );

COMMENT ON TABLE circle_visits IS 'Tracks scheduled, completed, and canceled Circle Visits for leaders';
COMMENT ON COLUMN circle_visits.visit_date IS 'Date and time of the visit. Can store date-only at 09:00 if time omitted';
COMMENT ON COLUMN circle_visits.status IS 'Visit status: scheduled, completed, or canceled';
COMMENT ON COLUMN circle_visits.previsit_note IS 'Optional briefing or context note for the visit';
