-- Point-in-time meeting cadence on weekly event-summary snapshots.
--
-- Companion to 20260623000000 (status/campus/circle_type/acpd). A leader's
-- meeting day, frequency, and start date are also temporal: when a leader changes
-- their schedule, reconstructing which past weeks they were "expected" to meet
-- from today's cadence is wrong. We capture cadence onto each snapshot row at
-- write time (same trigger), so reporting can reconstruct each past week from the
-- cadence as it was that week. meeting_time is display-only but captured for
-- consistency.

ALTER TABLE event_summary_snapshots
  ADD COLUMN IF NOT EXISTS meeting_day TEXT,
  ADD COLUMN IF NOT EXISTS meeting_frequency TEXT,
  ADD COLUMN IF NOT EXISTS meeting_time TEXT,
  ADD COLUMN IF NOT EXISTS meeting_start_date DATE;

-- Extend the existing capture trigger to also stamp cadence. Same COALESCE rule:
-- fill from the leader's current value only when unset, so first capture records
-- "as of now" and later edits to a past week don't rewrite its history.
CREATE OR REPLACE FUNCTION capture_snapshot_leader_attributes()
RETURNS TRIGGER AS $$
BEGIN
  NEW.leader_status      := COALESCE(NEW.leader_status,      (SELECT status FROM circle_leaders WHERE id = NEW.circle_leader_id));
  NEW.campus             := COALESCE(NEW.campus,             (SELECT campus FROM circle_leaders WHERE id = NEW.circle_leader_id));
  NEW.circle_type        := COALESCE(NEW.circle_type,        (SELECT circle_type FROM circle_leaders WHERE id = NEW.circle_leader_id));
  NEW.acpd               := COALESCE(NEW.acpd,               (SELECT acpd FROM circle_leaders WHERE id = NEW.circle_leader_id));
  NEW.meeting_day        := COALESCE(NEW.meeting_day,        (SELECT day FROM circle_leaders WHERE id = NEW.circle_leader_id));
  NEW.meeting_frequency  := COALESCE(NEW.meeting_frequency,  (SELECT frequency FROM circle_leaders WHERE id = NEW.circle_leader_id));
  NEW.meeting_time       := COALESCE(NEW.meeting_time,       (SELECT time FROM circle_leaders WHERE id = NEW.circle_leader_id));
  NEW.meeting_start_date := COALESCE(NEW.meeting_start_date, (SELECT meeting_start_date FROM circle_leaders WHERE id = NEW.circle_leader_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- No backfill on purpose (same rationale as the companion migration): the
-- reporting query falls back to current cadence at read time for NULL rows, so a
-- current-value backfill adds nothing and a table-wide UPDATE can time out the
-- SQL editor's gateway. Point-in-time capture begins with the next snapshot write.
