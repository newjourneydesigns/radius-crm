-- ============================================================================
-- Index: notes(circle_leader_id, created_at DESC)
-- ============================================================================
-- Every Circle Leader profile + notes page filters notes by circle_leader_id
-- and orders by created_at DESC. Without a matching index those queries do a
-- full table scan that gets slower as the notes table grows. This composite
-- index serves both the filter and the sort.

CREATE INDEX IF NOT EXISTS notes_leader_created_idx
  ON notes (circle_leader_id, created_at DESC);
