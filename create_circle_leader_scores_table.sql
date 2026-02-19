-- Create the Circle Leader Scores table for progress tracking
CREATE TABLE IF NOT EXISTS circle_leader_scores (
  id SERIAL PRIMARY KEY,
  circle_leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  scored_by UUID REFERENCES auth.users(id),
  reach_score SMALLINT CHECK (reach_score BETWEEN 1 AND 5),
  connect_score SMALLINT CHECK (connect_score BETWEEN 1 AND 5),
  disciple_score SMALLINT CHECK (disciple_score BETWEEN 1 AND 5),
  develop_score SMALLINT CHECK (develop_score BETWEEN 1 AND 5),
  notes TEXT,
  scored_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast per-leader lookups
CREATE INDEX IF NOT EXISTS idx_circle_leader_scores_leader_id
  ON circle_leader_scores (circle_leader_id);

CREATE INDEX IF NOT EXISTS idx_circle_leader_scores_scored_date
  ON circle_leader_scores (circle_leader_id, scored_date DESC);

-- Enable Row Level Security
ALTER TABLE circle_leader_scores ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all scores
CREATE POLICY "Authenticated users can read scores"
  ON circle_leader_scores
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert scores (scored_by will be their user id)
CREATE POLICY "Authenticated users can insert scores"
  ON circle_leader_scores
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow users to update/delete only their own scores
CREATE POLICY "Users can update own scores"
  ON circle_leader_scores
  FOR UPDATE
  USING (scored_by = auth.uid());

CREATE POLICY "Users can delete own scores"
  ON circle_leader_scores
  FOR DELETE
  USING (scored_by = auth.uid());
