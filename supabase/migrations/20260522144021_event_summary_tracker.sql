-- Event Summary Tracker — schema deltas
--
-- This is the lean delta on top of the existing /calendar infrastructure
-- (circle_meeting_occurrences, circle_event_summaries, event_summary_snapshots,
-- weekly_ai_summaries, event_summary_state_audit, ccb_week_sync_log).
--
-- Goals:
-- 1. Allow each Radius user to save their own AI weekly summary for a given week.
-- 2. Persist orphan detections from the CCB week pull so the banner can hydrate
--    without re-hitting CCB on every page load.

-- =============================================================================
-- 1. weekly_ai_summaries — per-user persistence
-- =============================================================================
-- The original migration constrained UNIQUE(week_start_date) which prevented
-- multiple ACPDs from each saving their own filtered AI summary for the same
-- week. Drop the global unique, replace with a composite that allows one row
-- per (week, generator).

DO $$
DECLARE
  cn text;
BEGIN
  SELECT conname
  INTO cn
  FROM pg_constraint
  WHERE conrelid = 'public.weekly_ai_summaries'::regclass
    AND contype  = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%(week_start_date)%';

  IF cn IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.weekly_ai_summaries DROP CONSTRAINT %I', cn);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS weekly_ai_summaries_week_user_uidx
  ON weekly_ai_summaries (week_start_date, generated_by);

CREATE INDEX IF NOT EXISTS weekly_ai_summaries_week_idx
  ON weekly_ai_summaries (week_start_date);

-- =============================================================================
-- 2. ccb_orphan_summaries — surfaces "CCB has a summary that isn't on the page"
-- =============================================================================
-- Populated on every Sync Now. Cleared per (week, ccb_event_id) on each sync.
-- Each row represents a CCB attendance record that did NOT cleanly resolve to
-- a Radius circle row that the current viewer would see.
--
-- category:
--   'filtered_out' - matched a Radius circle but it's hidden by the user's filters
--                    (computed client-side from this row; persisted only as 'matched')
--   'inactive'     - matched a Radius circle whose status is paused/off-boarding/etc
--   'unknown_group'- no matching Radius circle for the CCB group at all
--   'matched'      - resolved cleanly to an active leader; row exists for completeness
--                    but the UI only flags non-matched / inactive

CREATE TABLE IF NOT EXISTS ccb_orphan_summaries (
  id                UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start_date   DATE         NOT NULL,
  ccb_event_id      TEXT         NOT NULL,
  occurrence        TIMESTAMPTZ  NOT NULL,
  ccb_event_name    TEXT         NOT NULL,
  ccb_group_id      TEXT,
  did_not_meet      BOOLEAN      NOT NULL DEFAULT FALSE,
  head_count        INTEGER      NOT NULL DEFAULT 0,
  attendee_count    INTEGER      NOT NULL DEFAULT 0,
  matched_leader_id BIGINT       REFERENCES circle_leaders(id) ON DELETE SET NULL,
  category          TEXT         NOT NULL CHECK (category IN ('matched','inactive','unknown_group')),
  detected_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ccb_orphan_summaries_uidx
  ON ccb_orphan_summaries (week_start_date, ccb_event_id, occurrence);
CREATE INDEX IF NOT EXISTS ccb_orphan_summaries_week_idx
  ON ccb_orphan_summaries (week_start_date, category);

ALTER TABLE ccb_orphan_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read ccb_orphan_summaries"
  ON ccb_orphan_summaries
  FOR SELECT TO authenticated USING (true);

-- Writes are server-side only (service role bypasses RLS), so no insert/update
-- policies are needed. We never delete — older detections fall off via week filter.

-- =============================================================================
-- 3. Extend event_summary_state_audit source enum to include 'bulk_review'
-- =============================================================================
-- The audit table currently constrains source to one of the existing values.
-- Bulk review needs its own marker so we can distinguish it in the history.

DO $$
BEGIN
  ALTER TABLE event_summary_state_audit
    DROP CONSTRAINT IF EXISTS event_summary_state_audit_source_check;

  ALTER TABLE event_summary_state_audit
    ADD CONSTRAINT event_summary_state_audit_source_check
    CHECK (source IN (
      'manual',
      'app_submission',
      'sync_auto',
      'conflict_override',
      'admin_reset',
      'bulk_review',
      'unreview'
    ));
END $$;
