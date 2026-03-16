-- ============================================================
-- Card Assignments (many-to-many: cards ↔ users)
-- Replaces the text-based board_cards.assignee field with
-- proper user references for multi-assignee support.
-- ============================================================

CREATE TABLE IF NOT EXISTS card_assignments (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id       uuid NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at   timestamptz DEFAULT now(),
  assigned_by   uuid REFERENCES auth.users(id),
  UNIQUE (card_id, user_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_card_assignments_card_id ON card_assignments(card_id);
CREATE INDEX IF NOT EXISTS idx_card_assignments_user_id ON card_assignments(user_id);

-- Row-Level Security
ALTER TABLE card_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view card assignments"
  ON card_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage card assignments"
  ON card_assignments FOR ALL TO authenticated USING (true);

-- ============================================================
-- Migrate existing assignee text data to card_assignments
-- Matches board_cards.assignee against users.name (case-insensitive)
-- ============================================================
INSERT INTO card_assignments (card_id, user_id, assigned_by)
SELECT DISTINCT bc.id, u.id, bc.created_by
FROM board_cards bc
JOIN auth.users u ON lower(trim(bc.assignee)) = lower(trim(u.raw_user_meta_data->>'name'))
WHERE bc.assignee IS NOT NULL AND bc.assignee <> ''
ON CONFLICT (card_id, user_id) DO NOTHING;
