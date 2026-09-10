-- Event Summary Tracker: let an ACPD clear a week's alert for a circle.
--
-- Some weeks a circle legitimately has nothing to report — a holiday, a
-- retreat, a week the leader and the ACPD agreed to take off. Until now the
-- only ways off the "Awaiting Submission" list were "received" or "did not
-- meet", so an ACPD had to either leave a permanent red alert or record a
-- did-not-meet that was never true. Both corrupt the numbers.
--
-- A skip is deliberately NOT an event_summary_status. The existing 'skipped'
-- enum value is already wired as a synonym for did_not_meet — the
-- circle_leaders trigger folds it into event_summary_skipped, the dashboard
-- card renders it with the label "Did not meet", and circle-reporting counts
-- it as a reported miss. Reusing it would put these weeks straight into the
-- did-not-meet metric, which is the one thing this feature must not do. So a
-- skip lives in its own table and simply removes the week from what the
-- circle was expected to report.
--
-- Manual skips only. Weeks with no CCB calendar event are derived at read
-- time from event_summary_snapshots.ccb_event_scheduled — no rows needed.

CREATE TABLE IF NOT EXISTS event_summary_week_skips (
  id              BIGSERIAL PRIMARY KEY,
  leader_id       INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  -- The Sunday that starts the week, matching event_summary_snapshots.
  week_start_date DATE NOT NULL,
  note            TEXT,
  skipped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  skipped_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  UNIQUE (leader_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_eswk_week_start_date ON event_summary_week_skips(week_start_date);
CREATE INDEX IF NOT EXISTS idx_eswk_leader_id ON event_summary_week_skips(leader_id);

ALTER TABLE event_summary_week_skips ENABLE ROW LEVEL SECURITY;

-- Reads are open to any signed-in staff member, matching event_summary_snapshots.
-- Writes go through /api/event-summary-tracker/week-skip, which checks for an
-- ACPD/admin role and uses the service-role client, so no write policy is
-- granted here: a non-admin session cannot create or clear a skip.
CREATE POLICY "Authenticated users can read week skips"
  ON event_summary_week_skips FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE event_summary_week_skips IS
  'Weeks an ACPD cleared for a circle on the Event Summary Tracker. The week is dropped from what the circle was expected to report — it is not a did-not-meet and not a missing summary.';
COMMENT ON COLUMN event_summary_week_skips.week_start_date IS
  'The Sunday that starts the skipped week (week runs Sun through Sat).';
COMMENT ON COLUMN event_summary_week_skips.note IS
  'Optional reason, e.g. "Labor Day". Shown on the tracker row.';
