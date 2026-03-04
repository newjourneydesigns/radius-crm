-- ============================================================
-- Add is_public column to project_boards
-- When true, the board is visible (read-only) to all
-- authenticated users. Only the owner can edit/delete.
-- ============================================================

ALTER TABLE project_boards
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- ============================================================
-- Update RLS policies to allow viewing public boards
-- (Drop old private-only policies first, then re-create)
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own boards" ON project_boards;
DROP POLICY IF EXISTS "Users can insert own boards" ON project_boards;
DROP POLICY IF EXISTS "Users can update own boards" ON project_boards;
DROP POLICY IF EXISTS "Users can delete own boards" ON project_boards;

-- Also drop the original broad policies if they still exist
DROP POLICY IF EXISTS "Authenticated users can view boards" ON project_boards;
DROP POLICY IF EXISTS "Authenticated users can insert boards" ON project_boards;
DROP POLICY IF EXISTS "Authenticated users can update boards" ON project_boards;
DROP POLICY IF EXISTS "Authenticated users can delete boards" ON project_boards;

-- SELECT: own boards + public boards
CREATE POLICY "Users can view own or public boards"
  ON project_boards FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_public = true);

-- INSERT: only own boards
CREATE POLICY "Users can insert own boards"
  ON project_boards FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: only own boards
CREATE POLICY "Users can update own boards"
  ON project_boards FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- DELETE: only own boards
CREATE POLICY "Users can delete own boards"
  ON project_boards FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- Child tables: allow read access for public board children
-- ============================================================

-- board_columns
DROP POLICY IF EXISTS "Users can view own board columns" ON board_columns;
DROP POLICY IF EXISTS "Users can manage own board columns" ON board_columns;
DROP POLICY IF EXISTS "Authenticated users can view columns" ON board_columns;
DROP POLICY IF EXISTS "Authenticated users can manage columns" ON board_columns;

CREATE POLICY "Users can view own or public board columns"
  ON board_columns FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards
    WHERE id = board_columns.board_id AND (user_id = auth.uid() OR is_public = true)
  ));

CREATE POLICY "Users can manage own board columns"
  ON board_columns FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards
    WHERE id = board_columns.board_id AND user_id = auth.uid()
  ));

-- board_labels
DROP POLICY IF EXISTS "Users can view own board labels" ON board_labels;
DROP POLICY IF EXISTS "Users can manage own board labels" ON board_labels;
DROP POLICY IF EXISTS "Authenticated users can view labels" ON board_labels;
DROP POLICY IF EXISTS "Authenticated users can manage labels" ON board_labels;

CREATE POLICY "Users can view own or public board labels"
  ON board_labels FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards
    WHERE id = board_labels.board_id AND (user_id = auth.uid() OR is_public = true)
  ));

CREATE POLICY "Users can manage own board labels"
  ON board_labels FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards
    WHERE id = board_labels.board_id AND user_id = auth.uid()
  ));

-- board_cards
DROP POLICY IF EXISTS "Users can view own board cards" ON board_cards;
DROP POLICY IF EXISTS "Users can manage own board cards" ON board_cards;
DROP POLICY IF EXISTS "Authenticated users can view cards" ON board_cards;
DROP POLICY IF EXISTS "Authenticated users can manage cards" ON board_cards;

CREATE POLICY "Users can view own or public board cards"
  ON board_cards FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards
    WHERE id = board_cards.board_id AND (user_id = auth.uid() OR is_public = true)
  ));

CREATE POLICY "Users can manage own board cards"
  ON board_cards FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards
    WHERE id = board_cards.board_id AND user_id = auth.uid()
  ));

-- card_label_assignments
DROP POLICY IF EXISTS "Users can view own card label assignments" ON card_label_assignments;
DROP POLICY IF EXISTS "Users can manage own card label assignments" ON card_label_assignments;
DROP POLICY IF EXISTS "Authenticated users can view card_label_assignments" ON card_label_assignments;
DROP POLICY IF EXISTS "Authenticated users can manage card_label_assignments" ON card_label_assignments;

CREATE POLICY "Users can view own or public card label assignments"
  ON card_label_assignments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_label_assignments.card_id
      AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
  ));

CREATE POLICY "Users can manage own card label assignments"
  ON card_label_assignments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_label_assignments.card_id
      AND project_boards.user_id = auth.uid()
  ));

-- card_comments
DROP POLICY IF EXISTS "Users can view own board comments" ON card_comments;
DROP POLICY IF EXISTS "Users can manage own board comments" ON card_comments;
DROP POLICY IF EXISTS "Authenticated users can view comments" ON card_comments;
DROP POLICY IF EXISTS "Authenticated users can manage comments" ON card_comments;

CREATE POLICY "Users can view own or public board comments"
  ON card_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_comments.card_id
      AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
  ));

CREATE POLICY "Users can manage own board comments"
  ON card_comments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_comments.card_id
      AND project_boards.user_id = auth.uid()
  ));

-- card_checklists
DROP POLICY IF EXISTS "Users can view own board checklists" ON card_checklists;
DROP POLICY IF EXISTS "Users can manage own board checklists" ON card_checklists;
DROP POLICY IF EXISTS "Authenticated users can view checklists" ON card_checklists;
DROP POLICY IF EXISTS "Authenticated users can manage checklists" ON card_checklists;

CREATE POLICY "Users can view own or public board checklists"
  ON card_checklists FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_checklists.card_id
      AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
  ));

CREATE POLICY "Users can manage own board checklists"
  ON card_checklists FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_checklists.card_id
      AND project_boards.user_id = auth.uid()
  ));
