-- Per-person "Added to CCB" tracking for manual roster additions.
--
-- Leaders can report first-time people on an event summary who aren't in CCB
-- yet ("Add someone to my Circle" in the Circles Toolkit). Those requests are
-- stored in manual_roster_additions and now surface to ACPDs in the event
-- summary views, with a checkbox per person so unhandled CCB entry work can't
-- silently disappear once the summary is marked reviewed.

ALTER TABLE manual_roster_additions
  ADD COLUMN IF NOT EXISTS added_to_ccb_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS added_to_ccb_by UUID REFERENCES users(id);

-- The submit route reconciles child rows by summary; the summary views read by
-- summary as well. Only leader_id was indexed before.
CREATE INDEX IF NOT EXISTS manual_roster_additions_summary_idx
  ON manual_roster_additions (summary_id);

-- Pending-work lookup: roster-add requests nobody has entered into CCB yet.
CREATE INDEX IF NOT EXISTS manual_roster_additions_pending_idx
  ON manual_roster_additions (created_at DESC)
  WHERE added_to_ccb_at IS NULL;
