-- ============================================================
-- Leader Category Evaluations & Answers
-- Coaching-assistant scoring system for Reach, Connect, Disciple, Develop
-- ============================================================

-- 1. Evaluations — one per leader per category (current state)
CREATE TABLE IF NOT EXISTS leader_category_evaluations (
  id SERIAL PRIMARY KEY,
  leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('reach', 'connect', 'disciple', 'develop')),
  manual_override_score SMALLINT CHECK (manual_override_score IS NULL OR (manual_override_score >= 1 AND manual_override_score <= 5)),
  context_notes TEXT,
  evaluated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (leader_id, category)
);

CREATE INDEX IF NOT EXISTS idx_evaluations_leader
  ON leader_category_evaluations (leader_id);

CREATE INDEX IF NOT EXISTS idx_evaluations_leader_category
  ON leader_category_evaluations (leader_id, category);

ALTER TABLE leader_category_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read evaluations"
  ON leader_category_evaluations FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert evaluations"
  ON leader_category_evaluations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update evaluations"
  ON leader_category_evaluations FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete evaluations"
  ON leader_category_evaluations FOR DELETE
  USING (auth.role() = 'authenticated');

-- 2. Answers — one per question per evaluation
CREATE TABLE IF NOT EXISTS leader_category_answers (
  id SERIAL PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES leader_category_evaluations(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  answer TEXT CHECK (answer IS NULL OR answer IN ('yes', 'no')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (evaluation_id, question_key)
);

CREATE INDEX IF NOT EXISTS idx_answers_evaluation
  ON leader_category_answers (evaluation_id);

ALTER TABLE leader_category_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read answers"
  ON leader_category_answers FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert answers"
  ON leader_category_answers FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update answers"
  ON leader_category_answers FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete answers"
  ON leader_category_answers FOR DELETE
  USING (auth.role() = 'authenticated');
