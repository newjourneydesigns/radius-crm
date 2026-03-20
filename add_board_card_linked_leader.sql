-- Add linked_leader_id to board_cards to allow linking a card to a Circle Leader
ALTER TABLE board_cards
  ADD COLUMN IF NOT EXISTS linked_leader_id INTEGER REFERENCES circle_leaders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_board_cards_linked_leader_id ON board_cards(linked_leader_id) WHERE linked_leader_id IS NOT NULL;
