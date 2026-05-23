-- User-specific Big 3 slots shown on the Today page.
-- Clearing a slot removes only this assignment; the card and its labels remain.

CREATE TABLE IF NOT EXISTS today_big_three_slots (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_number smallint NOT NULL CHECK (slot_number BETWEEN 1 AND 3),
  card_id     uuid REFERENCES board_cards(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot_number)
);

CREATE INDEX IF NOT EXISTS idx_today_big_three_slots_card_id
  ON today_big_three_slots(card_id);

ALTER TABLE today_big_three_slots ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON today_big_three_slots TO authenticated;

DROP POLICY IF EXISTS "Users can view own Big 3 slots" ON today_big_three_slots;
DROP POLICY IF EXISTS "Users can insert own Big 3 slots" ON today_big_three_slots;
DROP POLICY IF EXISTS "Users can update own Big 3 slots" ON today_big_three_slots;
DROP POLICY IF EXISTS "Users can delete own Big 3 slots" ON today_big_three_slots;

CREATE POLICY "Users can view own Big 3 slots"
  ON today_big_three_slots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Big 3 slots"
  ON today_big_three_slots FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      card_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM board_cards
        JOIN project_boards ON project_boards.id = board_cards.board_id
        WHERE board_cards.id = today_big_three_slots.card_id
          AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
      )
    )
  );

CREATE POLICY "Users can update own Big 3 slots"
  ON today_big_three_slots FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      card_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM board_cards
        JOIN project_boards ON project_boards.id = board_cards.board_id
        WHERE board_cards.id = today_big_three_slots.card_id
          AND (project_boards.user_id = auth.uid() OR project_boards.is_public = true)
      )
    )
  );

CREATE POLICY "Users can delete own Big 3 slots"
  ON today_big_three_slots FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_today_big_three_slots_updated_at ON today_big_three_slots;
CREATE TRIGGER update_today_big_three_slots_updated_at
  BEFORE UPDATE ON today_big_three_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
