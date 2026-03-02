-- Migration: Add 'unsure' as a valid answer option for scorecard evaluations
-- Run this against your Supabase database

-- Drop the existing CHECK constraint on leader_category_answers.answer
-- and replace it with one that includes 'unsure'
ALTER TABLE leader_category_answers
  DROP CONSTRAINT IF EXISTS leader_category_answers_answer_check;

ALTER TABLE leader_category_answers
  ADD CONSTRAINT leader_category_answers_answer_check
  CHECK (answer IS NULL OR answer IN ('yes', 'no', 'unsure'));
