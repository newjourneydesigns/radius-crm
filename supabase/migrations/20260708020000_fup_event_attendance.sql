-- Event attendance tracking for Follow-Up Campaigns
--
-- A campaign can now point at the CCB event(s) it's inviting people to.
-- Reconcile pulls day-of check-ins (attendance_profile) from those events and
-- flags each campaign person who attended, closing the loop:
-- invited -> submitted (RSVP) -> attended.

ALTER TABLE follow_up_campaigns
  ADD COLUMN IF NOT EXISTS ccb_event_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attended_count INTEGER;

COMMENT ON COLUMN follow_up_campaigns.ccb_event_ids IS
  'CCB event IDs whose check-in attendance this campaign reconciles against (optional).';
COMMENT ON COLUMN follow_up_campaigns.attended_count IS
  'Cached count of campaign people who checked in to any of the configured events. Updated after each reconcile run.';

ALTER TABLE follow_up_campaign_people
  ADD COLUMN IF NOT EXISTS attended BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN follow_up_campaign_people.attended IS
  'True when the person checked in to one of the campaign''s CCB events. Set by reconcile; additive (a failed attendance fetch never clears it).';
