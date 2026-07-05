-- Nightly health-check digest for the Circle Leader Toolkit.
--
-- A new scheduled job runs each night (right after the CCB prewarm) and sends
-- one push per leader summarizing outstanding items — event summaries not yet
-- submitted and unread inbox messages — with a badgeCount so installed PWAs
-- show the number on the app icon even while the app is closed.

-- Allow the new delivery type alongside the existing ones.
ALTER TABLE circle_leader_notification_deliveries
  DROP CONSTRAINT IF EXISTS circle_leader_notification_deliveries_notification_type_check;
ALTER TABLE circle_leader_notification_deliveries
  ADD CONSTRAINT circle_leader_notification_deliveries_notification_type_check
  CHECK (notification_type IN ('inbox_message', 'summary_reminder', 'nightly_digest'));

-- One digest per leader per day. `occurrence` holds the digest's local
-- (America/Chicago) midnight as UTC, so re-runs of the cron the same day
-- dedupe via the insert conflict in deliverLeaderPush.
CREATE UNIQUE INDEX IF NOT EXISTS circle_leader_notification_deliveries_digest_uniq
  ON circle_leader_notification_deliveries (leader_id, occurrence)
  WHERE notification_type = 'nightly_digest' AND occurrence IS NOT NULL;

-- Per-leader opt-out for the nightly digest (on by default).
ALTER TABLE circle_leader_notification_preferences
  ADD COLUMN IF NOT EXISTS nightly_digest_push_enabled BOOLEAN NOT NULL DEFAULT TRUE;
