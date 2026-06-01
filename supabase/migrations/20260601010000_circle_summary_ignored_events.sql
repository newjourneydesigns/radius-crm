-- Circle Summary ignored CCB events
--
-- Lets an ACPD/admin suppress a bad or test CCB event occurrence from the
-- leader-facing Circle Summary event list without recording a fake summary or
-- marking the Circle as "did not meet".

CREATE TABLE IF NOT EXISTS circle_summary_ignored_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  ccb_group_id TEXT,
  ccb_event_id TEXT NOT NULL,
  occurrence_date DATE NOT NULL,
  occurrence_datetime TIMESTAMPTZ,
  event_title TEXT,
  reason TEXT,
  ignored_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ignored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS circle_summary_ignored_events_unique_occurrence
  ON circle_summary_ignored_events (leader_id, ccb_event_id, occurrence_date);

CREATE INDEX IF NOT EXISTS circle_summary_ignored_events_leader_date_idx
  ON circle_summary_ignored_events (leader_id, occurrence_date DESC);

CREATE INDEX IF NOT EXISTS circle_summary_ignored_events_group_idx
  ON circle_summary_ignored_events (ccb_group_id, occurrence_date DESC);

ALTER TABLE circle_summary_ignored_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read circle_summary_ignored_events"
  ON circle_summary_ignored_events
  FOR SELECT TO authenticated
  USING (true);

-- Writes go through server-side admin API routes using the service role.

COMMENT ON TABLE circle_summary_ignored_events IS
  'CCB event occurrences suppressed from the leader-facing Circle Summary event list.';
COMMENT ON COLUMN circle_summary_ignored_events.reason IS
  'Optional staff note explaining why this occurrence was hidden.';
