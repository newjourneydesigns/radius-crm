-- Email reminders for Circle Summary submissions
-- Adds opt-in toggle on circle_leaders and a dedup log so we don't double-send.

ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS email_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS circle_reminder_sends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id BIGINT REFERENCES circle_leaders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pre_meeting', 'follow_up')),
  ccb_event_id TEXT NOT NULL,
  occurrence_date DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One pre_meeting reminder per (leader, event, occurrence). Multiple follow_up
-- rows allowed (one per day), but we filter by sent_at::date when sending.
CREATE UNIQUE INDEX IF NOT EXISTS circle_reminder_sends_pre_meeting_uniq
  ON circle_reminder_sends (leader_id, ccb_event_id, occurrence_date)
  WHERE kind = 'pre_meeting';

CREATE INDEX IF NOT EXISTS circle_reminder_sends_lookup_idx
  ON circle_reminder_sends (leader_id, kind, occurrence_date, sent_at DESC);

ALTER TABLE circle_reminder_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read reminder_sends" ON circle_reminder_sends
  FOR SELECT TO authenticated USING (true);
