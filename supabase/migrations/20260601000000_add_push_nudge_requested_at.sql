-- Adds an admin-triggered "nudge" timestamp so the Circle Leader Hub can
-- re-surface the "Enable notifications" prompt for leaders who would not
-- receive a push, even if they previously dismissed it locally.

ALTER TABLE circle_leader_notification_preferences
  ADD COLUMN IF NOT EXISTS push_nudge_requested_at TIMESTAMPTZ;
