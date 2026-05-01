-- Add pray_date column to prayer point tables
-- This optional date lets you schedule a prayer to appear on the /today page
-- and in the daily digest email on the specified day.

ALTER TABLE acpd_prayer_points
  ADD COLUMN IF NOT EXISTS pray_date DATE NULL;

ALTER TABLE general_prayer_points
  ADD COLUMN IF NOT EXISTS pray_date DATE NULL;

-- Indexes for the today-page query (unanswered prayers with a pray_date)
CREATE INDEX IF NOT EXISTS idx_acpd_prayer_points_pray_date
  ON acpd_prayer_points (pray_date)
  WHERE pray_date IS NOT NULL AND is_answered = false;

CREATE INDEX IF NOT EXISTS idx_general_prayer_points_pray_date
  ON general_prayer_points (pray_date)
  WHERE pray_date IS NOT NULL AND is_answered = false;
