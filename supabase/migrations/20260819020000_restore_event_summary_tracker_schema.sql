-- Catch-up: restore Event Summary Tracker schema that never reached production.
--
-- Production Postgres has been logging ~80 errors/hour because two May 22
-- migrations were written to the repo but never applied to the live database:
--
--   42P01  relation "public.ccb_orphan_summaries" does not exist
--          (from 20260522144021_event_summary_tracker.sql)
--   42703  column event_summary_snapshots.ccb_event_scheduled does not exist
--          (from 20260522221804_event_summary_snapshot_ccb_event_setup.sql)
--
-- Every Event Summary Tracker page load and every Sync Now hits both, so the
-- orphan-summary banner never hydrates and the scheduled-event flag is never
-- persisted. This file consolidates just the still-missing pieces and is safe
-- to run repeatedly. The weekly_ai_summaries constraint swap from the May 22
-- migration is intentionally omitted — 20260420000005 already put the
-- composite (week_start_date, generated_by) unique in place.

-- =============================================================================
-- 1. ccb_orphan_summaries — CCB attendance rows that didn't cleanly resolve to
--    a visible Radius circle. Populated on every Sync Now; read by the tracker
--    page banner.
-- =============================================================================

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ccb_orphan_summaries'
      AND policyname = 'Authenticated read ccb_orphan_summaries'
  ) THEN
    CREATE POLICY "Authenticated read ccb_orphan_summaries"
      ON ccb_orphan_summaries
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Writes are server-side only (service role bypasses RLS), so no insert/update
-- policies are needed.

-- =============================================================================
-- 2. event_summary_snapshots.ccb_event_scheduled — distinguishes "CCB has an
--    event occurrence" from "an attendance report was submitted"
--    (ccb_report_available only covers the latter).
-- =============================================================================

ALTER TABLE event_summary_snapshots
  ADD COLUMN IF NOT EXISTS ccb_event_scheduled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN event_summary_snapshots.ccb_event_scheduled IS
  'TRUE when CCB has a matching event occurrence for this leader and week, even if no attendance report has been submitted.';

-- =============================================================================
-- 3. Extend event_summary_state_audit source values with bulk_review/unreview.
--    Without this, bulk review falls back to logging source='manual'.
--    Existing rows only use values from the old, smaller list, so re-adding
--    the constraint validates cleanly.
-- =============================================================================

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
