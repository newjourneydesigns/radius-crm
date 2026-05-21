-- Event summary review tracking + conflict dismissals + state-change audit.
-- Supports the new Circle Meetings Calendar flow:
--   • Silent background sync detects mismatches between RADIUS state and CCB.
--   • Admin explicitly chooses per-leader whether to override or keep current.
--   • Dismissals are remembered per-week so the same conflict doesn't keep nagging.
--   • Every state change is audited with its source.

-- 1. Review tracking on submitted summaries (app submissions)
ALTER TABLE circle_event_summaries
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS circle_event_summaries_unreviewed_idx
  ON circle_event_summaries (occurrence DESC)
  WHERE reviewed_at IS NULL;

-- 2. Review tracking on CCB-sourced meeting occurrences
ALTER TABLE circle_meeting_occurrences
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS circle_meeting_occurrences_unreviewed_idx
  ON circle_meeting_occurrences (meeting_date DESC)
  WHERE reviewed_at IS NULL;

-- 3. Conflict dismissals — admin chose "keep current" for a (leader, week)
CREATE TABLE IF NOT EXISTS event_summary_conflict_dismissals (
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ccb_state_at_dismissal TEXT NOT NULL,
  current_state_at_dismissal TEXT NOT NULL,
  PRIMARY KEY (leader_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS event_summary_conflict_dismissals_week_idx
  ON event_summary_conflict_dismissals (week_start_date);

ALTER TABLE event_summary_conflict_dismissals ENABLE ROW LEVEL SECURITY;

-- 4. State change audit log — every change with its source
CREATE TABLE IF NOT EXISTS event_summary_state_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN (
    'manual',
    'app_submission',
    'sync_auto',
    'conflict_override',
    'admin_reset'
  )),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS event_summary_state_audit_leader_idx
  ON event_summary_state_audit (leader_id, week_start_date, changed_at DESC);
CREATE INDEX IF NOT EXISTS event_summary_state_audit_week_idx
  ON event_summary_state_audit (week_start_date, changed_at DESC);

ALTER TABLE event_summary_state_audit ENABLE ROW LEVEL SECURITY;

-- 5. Per-leader peek throttle — caps the on-demand modal-open CCB calls
CREATE TABLE IF NOT EXISTS ccb_leader_peek_log (
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  last_peeked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (leader_id, week_start_date)
);

ALTER TABLE ccb_leader_peek_log ENABLE ROW LEVEL SECURITY;

-- 6. Per-week sync throttle — caps silent background sync to 30 min cadence
CREATE TABLE IF NOT EXISTS ccb_week_sync_log (
  week_start_date DATE PRIMARY KEY,
  week_end_date DATE NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_ccb_source TEXT,
  last_sync_summary JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE ccb_week_sync_log ENABLE ROW LEVEL SECURITY;
