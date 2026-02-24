-- Create Circle Attendance Tracking Tables
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
--
-- Two tables:
--   circle_meeting_occurrences  – one row per meeting date per leader
--   circle_meeting_attendees    – individual roster entries per occurrence
--
-- Statuses: 'met' | 'did_not_meet' | 'no_record'
--   met           = circle met, headcount recorded
--   did_not_meet  = leader reported the circle did not meet
--   no_record     = expected meeting date but no data from CCB or manual entry

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. circle_meeting_occurrences
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS circle_meeting_occurrences (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id       INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  ccb_event_id    TEXT,                                -- CCB event / event-profile ID
  meeting_date    DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'met'
                    CHECK (status IN ('met', 'did_not_meet', 'no_record')),
  headcount       INTEGER,                             -- total attendees (NULL if no_record)
  regular_count   INTEGER,                             -- regulars present
  visitor_count   INTEGER,                             -- visitors / first-timers
  notes           TEXT,
  source          TEXT DEFAULT 'ccb'
                    CHECK (source IN ('ccb', 'manual', 'event_summary')),
  raw_payload     JSONB,                               -- full CCB response for auditability
  synced_at       TIMESTAMPTZ DEFAULT NOW(),            -- when this row was last synced from CCB
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate entries for the same leader + date
  UNIQUE (leader_id, meeting_date)
);

-- ════════════════════════════════════════════════════════════════
-- 2. circle_meeting_attendees
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS circle_meeting_attendees (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  occurrence_id       UUID NOT NULL REFERENCES circle_meeting_occurrences(id) ON DELETE CASCADE,
  ccb_individual_id   TEXT,                            -- CCB individual ID
  name                TEXT NOT NULL,
  attendance_type     TEXT DEFAULT 'regular'
                        CHECK (attendance_type IN ('regular', 'visitor', 'leader')),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
-- 3. Indexes
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_occurrences_leader_date
  ON circle_meeting_occurrences(leader_id, meeting_date DESC);

CREATE INDEX IF NOT EXISTS idx_occurrences_date_range
  ON circle_meeting_occurrences(meeting_date DESC);

CREATE INDEX IF NOT EXISTS idx_occurrences_status
  ON circle_meeting_occurrences(status);

CREATE INDEX IF NOT EXISTS idx_attendees_occurrence
  ON circle_meeting_attendees(occurrence_id);

-- ════════════════════════════════════════════════════════════════
-- 4. Auto-update trigger for updated_at
-- ════════════════════════════════════════════════════════════════

-- Reuse the standard update_updated_at_column function (already exists in your DB)
-- CREATE OR REPLACE just to be safe:
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_meeting_occurrences_updated_at
  BEFORE UPDATE ON circle_meeting_occurrences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ════════════════════════════════════════════════════════════════
-- 5. Row Level Security
-- ════════════════════════════════════════════════════════════════

ALTER TABLE circle_meeting_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_meeting_attendees ENABLE ROW LEVEL SECURITY;

-- Read access for all authenticated users
CREATE POLICY "Authenticated users can read meeting occurrences"
  ON circle_meeting_occurrences FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read meeting attendees"
  ON circle_meeting_attendees FOR SELECT
  TO authenticated
  USING (true);

-- Service role (used by sync API) gets full access automatically via bypass
-- Insert/update/delete for authenticated users (admins will manage via API)
CREATE POLICY "Authenticated users can insert meeting occurrences"
  ON circle_meeting_occurrences FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update meeting occurrences"
  ON circle_meeting_occurrences FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete meeting occurrences"
  ON circle_meeting_occurrences FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert meeting attendees"
  ON circle_meeting_attendees FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update meeting attendees"
  ON circle_meeting_attendees FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete meeting attendees"
  ON circle_meeting_attendees FOR DELETE
  TO authenticated
  USING (true);

COMMIT;
