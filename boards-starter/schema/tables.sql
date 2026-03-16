-- ============================================================
-- GSD Board — Combined Database Schema (Supabase / PostgreSQL)
-- ============================================================

-- 1. project_boards — top-level boards
CREATE TABLE IF NOT EXISTS project_boards (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  notes         text,
  is_public     boolean DEFAULT false,
  is_archived   boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 2. board_columns — columns within a board (ordered)
CREATE TABLE IF NOT EXISTS board_columns (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id      uuid NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
  title         text NOT NULL,
  position      integer NOT NULL DEFAULT 0,
  color         text DEFAULT '#6366f1',
  created_at    timestamptz DEFAULT now()
);

-- 3. board_labels — label definitions per board
CREATE TABLE IF NOT EXISTS board_labels (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id      uuid NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
  name          text NOT NULL,
  color         text NOT NULL DEFAULT '#3b82f6'
);

-- 4. board_cards — cards within columns
CREATE TABLE IF NOT EXISTS board_cards (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  column_id     uuid NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  board_id      uuid NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  position      integer NOT NULL DEFAULT 0,
  priority      text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  start_date    date,
  due_date      date,
  assignee      text,
  created_by    uuid REFERENCES auth.users(id),
  is_archived   boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 5. card_label_assignments — many-to-many cards ↔ labels
CREATE TABLE IF NOT EXISTS card_label_assignments (
  card_id       uuid NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  label_id      uuid NOT NULL REFERENCES board_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

-- 6. card_comments — comments on cards
CREATE TABLE IF NOT EXISTS card_comments (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id       uuid NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  content       text NOT NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 7. card_checklists — checklist items on cards
CREATE TABLE IF NOT EXISTS card_checklists (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id       uuid NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  title         text NOT NULL,
  is_completed  boolean DEFAULT false,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- 8. checklist_templates — saved reusable checklist templates
CREATE TABLE IF NOT EXISTS checklist_templates (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id      uuid NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
  name          text NOT NULL,
  items         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_project_boards_user_id ON project_boards(user_id);
CREATE INDEX IF NOT EXISTS idx_board_columns_board_id ON board_columns(board_id);
CREATE INDEX IF NOT EXISTS idx_board_cards_column_id ON board_cards(column_id);
CREATE INDEX IF NOT EXISTS idx_board_cards_board_id ON board_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_board_labels_board_id ON board_labels(board_id);
CREATE INDEX IF NOT EXISTS idx_card_comments_card_id ON card_comments(card_id);
CREATE INDEX IF NOT EXISTS idx_card_checklists_card_id ON card_checklists(card_id);

-- ============================================================
-- Row-Level Security
-- ============================================================
ALTER TABLE project_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_label_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

-- project_boards: own boards + public boards
CREATE POLICY "Users can view own or public boards"
  ON project_boards FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "Users can insert own boards"
  ON project_boards FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own boards"
  ON project_boards FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own boards"
  ON project_boards FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- board_columns, board_labels, board_cards, card_label_assignments,
-- card_comments, card_checklists: team-shared (all authenticated)
CREATE POLICY "Authenticated access" ON board_columns FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated access" ON board_labels FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated access" ON board_cards FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated access" ON card_label_assignments FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated access" ON card_comments FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated access" ON card_checklists FOR ALL TO authenticated USING (true);

-- checklist_templates: user-private
CREATE POLICY "Users can view own checklist templates"
  ON checklist_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own checklist templates"
  ON checklist_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own checklist templates"
  ON checklist_templates FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Updated_at Triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_project_boards_updated_at
  BEFORE UPDATE ON project_boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_board_cards_updated_at
  BEFORE UPDATE ON board_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_card_comments_updated_at
  BEFORE UPDATE ON card_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
