-- Add named checklist groups so a card can have multiple titled checklists.
-- Items in card_checklists with group_id = NULL are "ungrouped" (legacy / default).

CREATE TABLE IF NOT EXISTS card_checklist_groups (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id    uuid NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'Checklist',
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE card_checklist_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_manage_checklist_groups"
  ON card_checklist_groups FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Add nullable FK from checklist items to their group (NULL = ungrouped)
ALTER TABLE card_checklists
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES card_checklist_groups(id) ON DELETE CASCADE;
