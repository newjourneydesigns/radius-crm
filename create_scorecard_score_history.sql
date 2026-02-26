-- Score History Tracking Table
-- Records a point each time an individual scorecard dimension is updated
-- Used by the Score Trends line chart

CREATE TABLE IF NOT EXISTS scorecard_score_history (
  id SERIAL PRIMARY KEY,
  circle_leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('reach', 'connect', 'disciple', 'develop')),
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  source TEXT NOT NULL DEFAULT 'evaluation' CHECK (source IN ('evaluation', 'direct', 'override')),
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  recorded_by UUID REFERENCES auth.users(id)
);

-- Index for efficient queries by leader + time
CREATE INDEX IF NOT EXISTS idx_score_history_leader_time 
  ON scorecard_score_history (circle_leader_id, recorded_at ASC);

-- Index for filtering by dimension
CREATE INDEX IF NOT EXISTS idx_score_history_leader_dim
  ON scorecard_score_history (circle_leader_id, dimension, recorded_at ASC);

-- RLS policies
ALTER TABLE scorecard_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view score history"
  ON scorecard_score_history FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert score history"
  ON scorecard_score_history FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
