-- ============================================================
-- ACPD Tracking Tables: Prayer Points, Encouragements, Coaching Notes
-- ============================================================

-- 1. Prayer Points
CREATE TABLE IF NOT EXISTS acpd_prayer_points (
  id SERIAL PRIMARY KEY,
  circle_leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_answered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prayer_points_leader
  ON acpd_prayer_points (circle_leader_id);

CREATE INDEX IF NOT EXISTS idx_prayer_points_user
  ON acpd_prayer_points (user_id);

ALTER TABLE acpd_prayer_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read prayer points"
  ON acpd_prayer_points FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert prayer points"
  ON acpd_prayer_points FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own prayer points"
  ON acpd_prayer_points FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own prayer points"
  ON acpd_prayer_points FOR DELETE
  USING (user_id = auth.uid());

-- 2. Encouragements (message tracking)
CREATE TABLE IF NOT EXISTS acpd_encouragements (
  id SERIAL PRIMARY KEY,
  circle_leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN ('sent', 'planned')),
  message_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encouragements_leader
  ON acpd_encouragements (circle_leader_id);

CREATE INDEX IF NOT EXISTS idx_encouragements_user_type
  ON acpd_encouragements (user_id, message_type);

ALTER TABLE acpd_encouragements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read encouragements"
  ON acpd_encouragements FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert encouragements"
  ON acpd_encouragements FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own encouragements"
  ON acpd_encouragements FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own encouragements"
  ON acpd_encouragements FOR DELETE
  USING (user_id = auth.uid());

-- 3. Coaching Notes (growth opportunities per dimension)
CREATE TABLE IF NOT EXISTS acpd_coaching_notes (
  id SERIAL PRIMARY KEY,
  circle_leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('reach', 'connect', 'disciple', 'develop')),
  content TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coaching_notes_leader
  ON acpd_coaching_notes (circle_leader_id);

CREATE INDEX IF NOT EXISTS idx_coaching_notes_dimension
  ON acpd_coaching_notes (circle_leader_id, dimension);

ALTER TABLE acpd_coaching_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read coaching notes"
  ON acpd_coaching_notes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert coaching notes"
  ON acpd_coaching_notes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own coaching notes"
  ON acpd_coaching_notes FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own coaching notes"
  ON acpd_coaching_notes FOR DELETE
  USING (user_id = auth.uid());
