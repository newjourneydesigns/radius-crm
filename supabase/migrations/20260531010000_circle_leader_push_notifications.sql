-- Circle Leader Hub push notifications, preferences, delivery logs, and
-- duplicate-prevention constraints for web push + app badge preferences.

ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS push_event_summary_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS badge_count_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS circle_leader_notification_preferences (
  leader_id BIGINT PRIMARY KEY REFERENCES circle_leaders(id) ON DELETE CASCADE,
  inbox_push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  summary_reminder_push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  badge_count_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS circle_leader_push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  device_label TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_successful_delivery_at TIMESTAMPTZ,
  last_failed_delivery_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  disabled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS circle_leader_push_subscriptions_leader_idx
  ON circle_leader_push_subscriptions (leader_id, enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS circle_leader_notification_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('inbox_message', 'summary_reminder')),
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  push_subscription_id UUID REFERENCES circle_leader_push_subscriptions(id) ON DELETE SET NULL,
  inbox_recipient_id UUID REFERENCES circle_summary_inbox_recipients(id) ON DELETE CASCADE,
  message_id UUID REFERENCES circle_summary_inbox_messages(id) ON DELETE CASCADE,
  ccb_event_id TEXT,
  occurrence TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One inbox push delivery attempt per durable recipient row.
CREATE UNIQUE INDEX IF NOT EXISTS circle_leader_notification_deliveries_inbox_uniq
  ON circle_leader_notification_deliveries (inbox_recipient_id)
  WHERE notification_type = 'inbox_message' AND inbox_recipient_id IS NOT NULL;

-- One event summary reminder push per leader/event occurrence.
CREATE UNIQUE INDEX IF NOT EXISTS circle_leader_notification_deliveries_summary_uniq
  ON circle_leader_notification_deliveries (leader_id, ccb_event_id, occurrence)
  WHERE notification_type = 'summary_reminder' AND ccb_event_id IS NOT NULL AND occurrence IS NOT NULL;

CREATE INDEX IF NOT EXISTS circle_leader_notification_deliveries_lookup_idx
  ON circle_leader_notification_deliveries (leader_id, notification_type, created_at DESC);

ALTER TABLE circle_leader_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_leader_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_leader_notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Circle Leader Hub uses server routes with leader-session cookies and the
-- service-role client; no direct browser policies are needed for these tables.
