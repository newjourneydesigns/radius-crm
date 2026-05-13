-- Allow authenticated users to collaborate on cards in any board they can see.
-- Board ownership still controls board metadata/sharing/deletion.

ALTER TABLE project_boards
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- board_cards: users can add, edit, move, archive, and delete cards on public boards.
DROP POLICY IF EXISTS "Users can manage own board cards" ON board_cards;
DROP POLICY IF EXISTS "Authenticated users can manage cards" ON board_cards;
DROP POLICY IF EXISTS "Users can manage visible board cards" ON board_cards;

CREATE POLICY "Users can manage visible board cards"
  ON board_cards FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM project_boards
      WHERE project_boards.id = board_cards.board_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM project_boards
      WHERE project_boards.id = board_cards.board_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
    AND EXISTS (
      SELECT 1
      FROM board_columns
      WHERE board_columns.id = board_cards.column_id
        AND board_columns.board_id = board_cards.board_id
    )
  );

-- card_label_assignments: users can apply/remove labels on visible-board cards.
DROP POLICY IF EXISTS "Users can manage own card label assignments" ON card_label_assignments;
DROP POLICY IF EXISTS "Authenticated users can manage card_label_assignments" ON card_label_assignments;
DROP POLICY IF EXISTS "Users can manage visible card label assignments" ON card_label_assignments;

CREATE POLICY "Users can manage visible card label assignments"
  ON card_label_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM board_cards
      JOIN project_boards ON project_boards.id = board_cards.board_id
      WHERE board_cards.id = card_label_assignments.card_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM board_cards
      JOIN board_labels ON board_labels.id = card_label_assignments.label_id
      JOIN project_boards ON project_boards.id = board_cards.board_id
      WHERE board_cards.id = card_label_assignments.card_id
        AND board_labels.board_id = board_cards.board_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
  );

-- card_comments: users can comment on and edit/delete comments on visible-board cards.
DROP POLICY IF EXISTS "Users can manage own board comments" ON card_comments;
DROP POLICY IF EXISTS "Authenticated users can manage comments" ON card_comments;
DROP POLICY IF EXISTS "Users can manage visible board comments" ON card_comments;

CREATE POLICY "Users can manage visible board comments"
  ON card_comments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM board_cards
      JOIN project_boards ON project_boards.id = board_cards.board_id
      WHERE board_cards.id = card_comments.card_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM board_cards
      JOIN project_boards ON project_boards.id = board_cards.board_id
      WHERE board_cards.id = card_comments.card_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
  );

-- card_checklists: users can add, rename, complete, date, link, and delete checklist items.
DROP POLICY IF EXISTS "Users can manage own board checklists" ON card_checklists;
DROP POLICY IF EXISTS "Authenticated users can manage checklists" ON card_checklists;
DROP POLICY IF EXISTS "Users can manage visible board checklists" ON card_checklists;

CREATE POLICY "Users can manage visible board checklists"
  ON card_checklists FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM board_cards
      JOIN project_boards ON project_boards.id = board_cards.board_id
      WHERE board_cards.id = card_checklists.card_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM board_cards
      JOIN project_boards ON project_boards.id = board_cards.board_id
      WHERE board_cards.id = card_checklists.card_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
  );

-- card_checklist_groups was originally broadly authenticated; replace that with
-- the same visible-board rule used by checklist items.
DROP POLICY IF EXISTS "authenticated_manage_checklist_groups" ON card_checklist_groups;
DROP POLICY IF EXISTS "Users can manage visible checklist groups" ON card_checklist_groups;

CREATE POLICY "Users can manage visible checklist groups"
  ON card_checklist_groups FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM board_cards
      JOIN project_boards ON project_boards.id = board_cards.board_id
      WHERE board_cards.id = card_checklist_groups.card_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM board_cards
      JOIN project_boards ON project_boards.id = board_cards.board_id
      WHERE board_cards.id = card_checklist_groups.card_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
  );

-- card_assignments: keep assignment edits scoped to visible-board cards.
DROP POLICY IF EXISTS "Authenticated users can manage card assignments" ON card_assignments;
DROP POLICY IF EXISTS "Users can manage visible card assignments" ON card_assignments;

CREATE POLICY "Users can manage visible card assignments"
  ON card_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM board_cards
      JOIN project_boards ON project_boards.id = board_cards.board_id
      WHERE board_cards.id = card_assignments.card_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM board_cards
      JOIN project_boards ON project_boards.id = board_cards.board_id
      WHERE board_cards.id = card_assignments.card_id
        AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
    )
  );
