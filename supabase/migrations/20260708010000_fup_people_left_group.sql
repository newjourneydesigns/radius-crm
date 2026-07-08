-- Sticky invite list for Follow-Up Campaigns
--
-- Once someone is invited (present in a campaign's CCB group at any reconcile),
-- being removed from the group later must not erase that: they were invited,
-- and if they submitted, their registration still counts. Reconcile now carries
-- previously-invited people forward and marks them with left_group so the UI
-- can show they're no longer in the CCB group.

ALTER TABLE follow_up_campaign_people
  ADD COLUMN IF NOT EXISTS left_group BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN follow_up_campaign_people.left_group IS
  'True when the person was on the campaign''s invite list but is no longer in any of its CCB groups. They stay invited (in_group remains true) so counts and completion stay accurate.';
