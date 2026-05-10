-- Track when a prayer was actually prayed, separate from the scheduled pray_date.

ALTER TABLE acpd_prayer_points
  ADD COLUMN IF NOT EXISTS prayed_on DATE NULL;

ALTER TABLE general_prayer_points
  ADD COLUMN IF NOT EXISTS prayed_on DATE NULL;