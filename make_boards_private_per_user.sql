-- ============================================================
-- Make all board tables private per user
-- Boards are scoped to the user who created them.
-- Child tables (columns, cards, labels, etc.) inherit access
-- through the parent board's user_id.
-- ============================================================

-- 1. project_boards — only the owner can see/edit/delete
DROP POLICY IF EXISTS "Authenticated users can view boards" ON project_boards;
DROP POLICY IF EXISTS "Authenticated users can insert boards" ON project_boards;
DROP POLICY IF EXISTS "Authenticated users can update boards" ON project_boards;
DROP POLICY IF EXISTS "Authenticated users can delete boards" ON project_boards;

CREATE POLICY "Users can view own boards"
  ON project_boards FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own boards"
  ON project_boards FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own boards"
  ON project_boards FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own boards"
  ON project_boards FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 2. board_columns — only if user owns the parent board
DROP POLICY IF EXISTS "Authenticated users can view columns" ON board_columns;
DROP POLICY IF EXISTS "Authenticated users can manage columns" ON board_columns;

CREATE POLICY "Users can view own board columns"
  ON board_columns FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards WHERE id = board_columns.board_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own board columns"
  ON board_columns FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards WHERE id = board_columns.board_id AND user_id = auth.uid()
  ));

-- 3. board_labels — only if user owns the parent board
DROP POLICY IF EXISTS "Authenticated users can view labels" ON board_labels;
DROP POLICY IF EXISTS "Authenticated users can manage labels" ON board_labels;

CREATE POLICY "Users can view own board labels"
  ON board_labels FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards WHERE id = board_labels.board_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own board labels"
  ON board_labels FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards WHERE id = board_labels.board_id AND user_id = auth.uid()
  ));

-- 4. board_cards — only if user owns the parent board
DROP POLICY IF EXISTS "Authenticated users can view cards" ON board_cards;
DROP POLICY IF EXISTS "Authenticated users can manage cards" ON board_cards;

CREATE POLICY "Users can view own board cards"
  ON board_cards FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards WHERE id = board_cards.board_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own board cards"
  ON board_cards FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_boards WHERE id = board_cards.board_id AND user_id = auth.uid()
  ));

-- 5. card_label_assignments — only if user owns the card's board
DROP POLICY IF EXISTS "Authenticated users can view card_label_assignments" ON card_label_assignments;
DROP POLICY IF EXISTS "Authenticated users can manage card_label_assignments" ON card_label_assignments;

CREATE POLICY "Users can view own card label assignments"
  ON card_label_assignments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_label_assignments.card_id AND project_boards.user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own card label assignments"
  ON card_label_assignments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_label_assignments.card_id AND project_boards.user_id = auth.uid()
  ));

-- 6. card_comments — only if user owns the card's board
DROP POLICY IF EXISTS "Authenticated users can view comments" ON card_comments;
DROP POLICY IF EXISTS "Authenticated users can manage comments" ON card_comments;

CREATE POLICY "Users can view own board comments"
  ON card_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_comments.card_id AND project_boards.user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own board comments"
  ON card_comments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_comments.card_id AND project_boards.user_id = auth.uid()
  ));

-- 7. card_checklists — only if user owns the card's board
DROP POLICY IF EXISTS "Authenticated users can view checklists" ON card_checklists;
DROP POLICY IF EXISTS "Authenticated users can manage checklists" ON card_checklists;

CREATE POLICY "Users can view own board checklists"
  ON card_checklists FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_checklists.card_id AND project_boards.user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own board checklists"
  ON card_checklists FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM board_cards
    JOIN project_boards ON project_boards.id = board_cards.board_id
    WHERE board_cards.id = card_checklists.card_id AND project_boards.user_id = auth.uid()
  ));
