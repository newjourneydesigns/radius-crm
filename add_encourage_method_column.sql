-- ============================================================
-- Add encourage_method column to acpd_encouragements
-- Tracks the method used: text, email, call, in_person, card, other
-- ============================================================

ALTER TABLE acpd_encouragements
  ADD COLUMN IF NOT EXISTS encourage_method TEXT NOT NULL DEFAULT 'other'
  CHECK (encourage_method IN ('text', 'email', 'call', 'in_person', 'card', 'other'));

CREATE INDEX IF NOT EXISTS idx_acpd_encouragements_method
  ON acpd_encouragements (encourage_method);
