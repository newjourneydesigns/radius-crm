-- Circle calendar snapshot — CCB group calendar as the scheduling source of truth
--
-- RADIUS previously hand-maintained day/time/frequency scalars on circle_leaders
-- and re-derived "does this circle meet on date X" in several divergent places.
-- These tables snapshot the group's REAL event occurrence dates from the CCB v2
-- API (GET /groups/{id}/calendar) so odd cadences ("1st, 3rd", every-other-week,
-- irregular) are captured exactly as CCB has them.
--
-- Written by lib/ccb/circle-calendar-sync.ts (service role) from:
--   * the import flow (app/api/ccb/import-circles POST),
--   * the per-circle Resync Calendar action (app/api/circle-leaders/[id]/sync-calendar),
--   * the admin bulk backfill (app/api/ccb/sync-circle-calendars).
-- There is NO automatic refresh cron — resyncs are manual by design.
--
-- Read client-side (Tier B RLS) by the event summary tracker and circle profile,
-- and server-side by lib/circleSchedule.ts (the shared scheduling helper).

-- 1. One row per event occurrence on the group's calendar (all series, e.g. the
--    circle meeting plus socials). is_dominant marks the schedule-driving series.
CREATE TABLE IF NOT EXISTS circle_calendar_occurrences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  ccb_group_id TEXT NOT NULL,
  ccb_event_id TEXT NOT NULL,
  event_name TEXT,
  occurrence_date DATE NOT NULL,   -- church-local date from CCB's "YYYYMMDD"
  start_time TEXT,                 -- "HH:mm" wall clock, extracted verbatim from CCB
  starts_at TEXT,                  -- raw CCB start string (provenance; not tz-reinterpreted)
  ends_at TEXT,
  is_dominant BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS circle_calendar_occurrences_unique
  ON circle_calendar_occurrences (leader_id, ccb_event_id, occurrence_date);

CREATE INDEX IF NOT EXISTS circle_calendar_occurrences_leader_date_idx
  ON circle_calendar_occurrences (leader_id, occurrence_date);

CREATE INDEX IF NOT EXISTS circle_calendar_occurrences_date_dominant_idx
  ON circle_calendar_occurrences (occurrence_date) WHERE is_dominant;

-- 2. Per-leader sync state — one row per circle, stamped on every sync attempt.
--    first/last_occurrence_date and future_count describe the DOMINANT series
--    (the schedule-driving one); last_occurrence_date is the "runway end" that
--    lets consumers detect coverage without scanning occurrence rows.
CREATE TABLE IF NOT EXISTS circle_calendar_sync_state (
  leader_id BIGINT PRIMARY KEY REFERENCES circle_leaders(id) ON DELETE CASCADE,
  ccb_group_id TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'no_events', 'error')),
  error TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  future_count INTEGER NOT NULL DEFAULT 0,
  first_occurrence_date DATE,
  last_occurrence_date DATE,
  dominant_event_id TEXT,
  dominant_event_name TEXT,
  derived_day TEXT,
  derived_time TEXT,
  derived_frequency TEXT,
  derived_meeting_start_date DATE,
  last_sync_summary JSONB DEFAULT '{}'::jsonb
);

-- 3. Which system owns the schedule fields. 'ccb_calendar' locks day/time/
--    frequency in the UI (they are derived from the snapshot on each sync);
--    'manual' keeps them editable (circle has no usable CCB calendar data).
ALTER TABLE circle_leaders ADD COLUMN IF NOT EXISTS schedule_source TEXT NOT NULL DEFAULT 'manual';

DO $$ BEGIN
  ALTER TABLE circle_leaders ADD CONSTRAINT circle_leaders_schedule_source_check
    CHECK (schedule_source IN ('manual', 'ccb_calendar'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE circle_calendar_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_calendar_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read circle_calendar_occurrences" ON circle_calendar_occurrences;
CREATE POLICY "Authenticated read circle_calendar_occurrences"
  ON circle_calendar_occurrences
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated read circle_calendar_sync_state" ON circle_calendar_sync_state;
CREATE POLICY "Authenticated read circle_calendar_sync_state"
  ON circle_calendar_sync_state
  FOR SELECT TO authenticated
  USING (true);

-- Writes go through server-side routes using the service role; no write policies.

COMMENT ON TABLE circle_calendar_occurrences IS
  'Snapshot of a circle''s CCB group calendar (v2 GET /groups/{id}/calendar): one row per event occurrence. Replaced wholesale on each manual sync.';
COMMENT ON COLUMN circle_calendar_occurrences.is_dominant IS
  'True when the row belongs to the dominant (schedule-driving) event series for this circle.';
COMMENT ON TABLE circle_calendar_sync_state IS
  'Per-circle CCB calendar sync state: window, counts, dominant series, derived schedule audit. Stamped on every manual sync attempt.';
COMMENT ON COLUMN circle_calendar_sync_state.last_occurrence_date IS
  'Last dominant-series occurrence date — the snapshot''s scheduling runway end.';
COMMENT ON COLUMN circle_leaders.schedule_source IS
  '''ccb_calendar'' = day/time/frequency derived from the CCB calendar snapshot (read-only in UI); ''manual'' = hand-maintained.';
