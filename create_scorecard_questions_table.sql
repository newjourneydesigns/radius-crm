-- ============================================================
-- Scorecard Questions — configurable evaluation questions
-- Allows admins to customize questions per category (reach, connect, disciple, develop)
-- ============================================================

CREATE TABLE IF NOT EXISTS scorecard_questions (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('reach', 'connect', 'disciple', 'develop')),
  question_key TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (category, question_key)
);

CREATE INDEX IF NOT EXISTS idx_scorecard_questions_category
  ON scorecard_questions (category);

CREATE INDEX IF NOT EXISTS idx_scorecard_questions_active
  ON scorecard_questions (category, is_active, sort_order);

ALTER TABLE scorecard_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scorecard questions"
  ON scorecard_questions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert scorecard questions"
  ON scorecard_questions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update scorecard questions"
  ON scorecard_questions FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete scorecard questions"
  ON scorecard_questions FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================================
-- Add question_text column to leader_category_answers
-- Preserves the exact question that was asked at time of answering
-- ============================================================

ALTER TABLE leader_category_answers
  ADD COLUMN IF NOT EXISTS question_text TEXT;
