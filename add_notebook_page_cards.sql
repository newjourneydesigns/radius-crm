-- ============================================================
-- Add card-level links to Notebook pages
-- Run this in the Supabase SQL Editor after create_notebook_tables.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS notebook_page_cards (
  page_id   uuid    NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
  card_id   uuid    NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  linked_by uuid    NOT NULL REFERENCES auth.users(id),
  linked_at timestamptz DEFAULT now(),
  PRIMARY KEY (page_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_npc_page_id ON notebook_page_cards(page_id);
CREATE INDEX IF NOT EXISTS idx_npc_card_id ON notebook_page_cards(card_id);

ALTER TABLE notebook_page_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notebook page cards"
  ON notebook_page_cards FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = page_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own notebook page cards"
  ON notebook_page_cards FOR INSERT TO authenticated
  WITH CHECK (
    linked_by = auth.uid() AND
    EXISTS (SELECT 1 FROM notebook_pages p WHERE p.id = page_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own notebook page cards"
  ON notebook_page_cards FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = page_id AND p.user_id = auth.uid()
  ));
