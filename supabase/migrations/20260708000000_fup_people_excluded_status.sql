-- Off-boarding for Follow-Up Campaigns
--
-- Admins need to remove people from the "Unsubmitted" pool for edge cases —
-- someone off-boarded as a leader, or known not to be coming but unable to RSVP.
-- These people should not count against the campaign's completion percentage.
--
-- We add a new 'excluded' reconcile_status. Excluded people are counted in none
-- of the completion buckets (submitted / missing / needs_review), so they drop
-- out of both the "Invited" denominator and the "Unsubmitted" pool automatically.
-- The status is preserved across reconcile runs (see the reconcile API route).

ALTER TABLE follow_up_campaign_people
  DROP CONSTRAINT IF EXISTS follow_up_campaign_people_reconcile_status_check;

ALTER TABLE follow_up_campaign_people
  ADD CONSTRAINT follow_up_campaign_people_reconcile_status_check
  CHECK (reconcile_status IN (
    'expected',               -- in group only, reconcile not yet run
    'submitted',              -- matched: in both group and form
    'missing',                -- in group but NOT in form responses
    'submitted_not_in_group', -- in form but NOT in the group
    'needs_review',           -- fuzzy name match, human confirmation needed
    'contacted',              -- admin marked as followed up
    'excluded'                -- admin off-boarded: removed from the unsubmitted pool
  ));

COMMENT ON COLUMN follow_up_campaign_people.reconcile_status IS
  'Canonical reconciliation bucket. ''excluded'' means an admin off-boarded the person so they no longer count toward the campaign''s completion percentage.';
