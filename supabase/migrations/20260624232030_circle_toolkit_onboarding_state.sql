-- Circle Toolkit onboarding state.
--
-- Kept on circle_leaders instead of a new public table so the existing
-- service-role toolkit routes can read/write it without exposing another Data
-- API surface. Existing leaders with a successful real summary are backfilled
-- as complete so this flow only catches new leaders.

ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS toolkit_home_screen_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS toolkit_home_screen_dismissed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS toolkit_notifications_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS toolkit_notifications_dismissed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS toolkit_practice_summary_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS toolkit_onboarding_completed_at TIMESTAMPTZ;

UPDATE circle_leaders cl
SET
  toolkit_home_screen_completed_at = COALESCE(cl.toolkit_home_screen_completed_at, NOW()),
  toolkit_notifications_completed_at = COALESCE(cl.toolkit_notifications_completed_at, NOW()),
  toolkit_practice_summary_completed_at = COALESCE(cl.toolkit_practice_summary_completed_at, NOW()),
  toolkit_onboarding_completed_at = COALESCE(cl.toolkit_onboarding_completed_at, NOW())
WHERE cl.toolkit_onboarding_completed_at IS NULL
  AND (
    EXISTS (
      SELECT 1
      FROM circle_event_summaries ces
      WHERE ces.leader_id = cl.id
        AND ces.status = 'submitted'
        AND ces.ccb_submitted_at IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
      FROM leader_sessions ls
      WHERE ls.leader_id = cl.id
    )
  );

CREATE INDEX IF NOT EXISTS circle_leaders_toolkit_onboarding_idx
  ON circle_leaders (toolkit_onboarding_completed_at)
  WHERE circle_summary_access_enabled IS TRUE;
