-- ============================================================
-- Board Forms — public intake → card creation
--
-- Lets a logged-in user publish a public form tied to a board.
-- Anonymous visitors submit it at /f/<slug>; the submit API turns
-- the submission into a card in the form's target column and logs
-- the raw submission for the record.
--
-- Apply this in the Supabase SQL editor (same workflow as the other
-- create_*.sql files in this repo). It is additive and safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS board_forms (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id      uuid NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
  column_id     uuid NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  slug          text NOT NULL UNIQUE,
  fields        jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id       uuid NOT NULL REFERENCES board_forms(id) ON DELETE CASCADE,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  card_id       uuid REFERENCES board_cards(id) ON DELETE SET NULL,
  submitted_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_forms_user_id ON board_forms(user_id);
CREATE INDEX IF NOT EXISTS idx_board_forms_board_id ON board_forms(board_id);
CREATE INDEX IF NOT EXISTS idx_board_forms_slug ON board_forms(slug);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id ON form_submissions(form_id);

ALTER TABLE board_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

-- Owner manages their own forms
DROP POLICY IF EXISTS "View own forms"   ON board_forms;
DROP POLICY IF EXISTS "Insert own forms" ON board_forms;
DROP POLICY IF EXISTS "Update own forms" ON board_forms;
DROP POLICY IF EXISTS "Delete own forms" ON board_forms;
CREATE POLICY "View own forms"   ON board_forms FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Insert own forms" ON board_forms FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own forms" ON board_forms FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Delete own forms" ON board_forms FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Public (anon) can read ACTIVE forms only — powers the public /f/<slug> page
DROP POLICY IF EXISTS "Public read active forms" ON board_forms;
CREATE POLICY "Public read active forms" ON board_forms FOR SELECT TO anon USING (is_active = true);

-- Submissions: owner reads, anon + auth can insert
DROP POLICY IF EXISTS "View own submissions" ON form_submissions;
DROP POLICY IF EXISTS "Anon insert submissions" ON form_submissions;
DROP POLICY IF EXISTS "Auth insert submissions" ON form_submissions;
CREATE POLICY "View own submissions" ON form_submissions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM board_forms f WHERE f.id = form_submissions.form_id AND f.user_id = auth.uid())
);
CREATE POLICY "Anon insert submissions" ON form_submissions FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY "Auth insert submissions" ON form_submissions FOR INSERT TO authenticated  WITH CHECK (true);

-- The submit API uses the service-role key (which bypasses RLS), so the anon
-- card/column policies below are only needed if a form is ever submitted from
-- the browser with the anon key. Included to keep that option open and to mirror
-- the source implementation.
DROP POLICY IF EXISTS "Anon insert cards"   ON board_cards;
DROP POLICY IF EXISTS "Anon read columns"   ON board_columns;
DROP POLICY IF EXISTS "Anon read cards"     ON board_cards;
CREATE POLICY "Anon insert cards"   ON board_cards   FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon read columns"   ON board_columns FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read cards"     ON board_cards   FOR SELECT TO anon USING (true);

-- update_updated_at_column() already exists (created in create_project_boards_tables.sql).
DROP TRIGGER IF EXISTS update_board_forms_updated_at ON board_forms;
CREATE TRIGGER update_board_forms_updated_at
  BEFORE UPDATE ON board_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
