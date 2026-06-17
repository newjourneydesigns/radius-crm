-- Touchpoint Tracker
--
-- ACPDs make at least one touchpoint per Circle Leader per semester, giving
-- specific feedback on the leader's event/debrief summaries. This replaces the
-- spreadsheet ACPDs used to track that coverage, and lets leadership see
-- coverage across every ACPD and campus.
--
-- This migration adds:
--   1. touchpoints          — one row per logged ACPD↔leader touchpoint.
--   2. touchpoint_settings  — singleton row: the one org-wide cadence target.

-- Shared updated_at trigger (defensive: also created by earlier migrations).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Logged touchpoints -------------------------------------------------------
CREATE TABLE IF NOT EXISTS touchpoints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  circle_leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method TEXT NOT NULL DEFAULT 'note'
    CHECK (method IN ('text', 'call', 'in_person', 'email', 'note', 'other')),
  notes TEXT,
  -- Optional link to the debrief/event summary that prompted the touchpoint.
  -- circle_event_summaries.id is UUID; snapshots below let the tracker render
  -- the source event without a join.
  circle_event_summary_id UUID REFERENCES circle_event_summaries(id) ON DELETE SET NULL,
  event_occurrence TIMESTAMPTZ,
  event_topic TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE touchpoints ENABLE ROW LEVEL SECURITY;
-- No browser-facing policies: read/write happens through server routes using the
-- service-role client (ACPD-authenticated create/list; cron read for reminders).
CREATE INDEX IF NOT EXISTS touchpoints_leader_occurred_idx
  ON touchpoints (circle_leader_id, occurred_at DESC);
COMMENT ON TABLE touchpoints IS 'One row per ACPD-logged touchpoint with a Circle Leader. Counts toward the per-leader cadence target in touchpoint_settings.';

DROP TRIGGER IF EXISTS set_updated_at_touchpoints ON touchpoints;
CREATE TRIGGER set_updated_at_touchpoints
  BEFORE UPDATE ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Global cadence config (singleton, mirrors leadership_snapshot_settings) ---
CREATE TABLE IF NOT EXISTS touchpoint_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config JSONB NOT NULL DEFAULT '{"target_per_period": 1, "terms": []}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE touchpoint_settings ENABLE ROW LEVEL SECURITY;
-- No browser-facing policies: read (any signed-in user) / write (ACPD admin) go
-- through the /api/touchpoint-settings server route using the service-role client.
COMMENT ON TABLE touchpoint_settings IS 'Singleton row: one central, all-campus touchpoint cadence. config = { target_per_period, terms:[{id,name,start,end}] }. The active period is whichever saved term contains today.';

-- Seed the singleton row so the settings API always has a row to read/upsert.
INSERT INTO touchpoint_settings (id, config)
VALUES (1, '{"target_per_period": 1, "terms": []}'::jsonb)
ON CONFLICT (id) DO NOTHING;
