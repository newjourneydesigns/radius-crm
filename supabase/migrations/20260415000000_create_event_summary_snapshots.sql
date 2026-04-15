-- Migration: Create event_summary_snapshots table
-- Stores a weekly snapshot of each circle leader's event summary state.
-- A snapshot is captured when the "Reset All Event Summaries" button is clicked,
-- preserving the week's results before resetting everyone to not_received.

CREATE TABLE IF NOT EXISTS event_summary_snapshots (
  id           BIGSERIAL PRIMARY KEY,
  week_start_date DATE NOT NULL,           -- Sunday of the week (e.g. 2026-04-12)
  week_end_date   DATE NOT NULL,           -- Saturday of the week (e.g. 2026-04-18)
  circle_leader_id INTEGER NOT NULL,
  event_summary_state event_summary_status NOT NULL DEFAULT 'not_received',
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Only one record per leader per week
  UNIQUE (week_start_date, circle_leader_id)
);

CREATE INDEX IF NOT EXISTS idx_ess_week_start_date ON event_summary_snapshots(week_start_date);
CREATE INDEX IF NOT EXISTS idx_ess_circle_leader_id ON event_summary_snapshots(circle_leader_id);

-- Enable RLS
ALTER TABLE event_summary_snapshots ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all snapshots
CREATE POLICY "Authenticated users can read snapshots"
  ON event_summary_snapshots FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert snapshots
CREATE POLICY "Authenticated users can insert snapshots"
  ON event_summary_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update snapshots (for editing past weeks)
CREATE POLICY "Authenticated users can update snapshots"
  ON event_summary_snapshots FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE event_summary_snapshots IS 'Weekly archive of each circle leader''s event summary state, captured when the calendar is reset at the start of each week.';
COMMENT ON COLUMN event_summary_snapshots.week_start_date IS 'The Sunday that starts the week (week runs Sun through Sat).';
COMMENT ON COLUMN event_summary_snapshots.week_end_date IS 'The Saturday that ends the week.';
