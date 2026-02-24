-- General Prayer Points table
-- For prayers not tied to a specific circle leader (ministry, initiative, church-wide)

CREATE TABLE IF NOT EXISTS general_prayer_points (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_answered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_general_prayer_points_user ON general_prayer_points(user_id);
CREATE INDEX IF NOT EXISTS idx_general_prayer_points_answered ON general_prayer_points(is_answered);

-- RLS
ALTER TABLE general_prayer_points ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view all general prayer points
CREATE POLICY "Authenticated users can view general prayer points"
  ON general_prayer_points FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert general prayer points
CREATE POLICY "Authenticated users can insert general prayer points"
  ON general_prayer_points FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Authenticated users can update general prayer points
CREATE POLICY "Authenticated users can update general prayer points"
  ON general_prayer_points FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Authenticated users can delete general prayer points
CREATE POLICY "Authenticated users can delete general prayer points"
  ON general_prayer_points FOR DELETE
  TO authenticated
  USING (true);
