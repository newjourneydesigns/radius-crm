-- Add missing aggregate count columns to follow_up_campaigns.
-- The initial migration only included expected_count, submitted_count, missing_count,
-- and completion_pct. The reconcile and contact routes also write not_in_group_count,
-- needs_review_count, and contacted_count, so we add them here.

ALTER TABLE follow_up_campaigns
  ADD COLUMN IF NOT EXISTS not_in_group_count INTEGER,
  ADD COLUMN IF NOT EXISTS needs_review_count  INTEGER,
  ADD COLUMN IF NOT EXISTS contacted_count     INTEGER;

COMMENT ON COLUMN follow_up_campaigns.not_in_group_count IS
  'Cached count of people in the form but not in any of the configured CCB groups. Updated after each reconcile run.';
COMMENT ON COLUMN follow_up_campaigns.needs_review_count IS
  'Cached count of people whose name fuzzy-matched between group and form but needs human confirmation. Updated after each reconcile run.';
COMMENT ON COLUMN follow_up_campaigns.contacted_count IS
  'Cached count of people marked as contacted by admins. Updated after each reconcile run and after marking contacts.';
