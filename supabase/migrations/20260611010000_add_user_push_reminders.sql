-- RADIUS user push reminders — Web Push subscriptions for ACPD/admin users and
-- a delivery log that prevents duplicate sends for the same timed item.
-- (Mirrors the Circle Leader Toolkit push tables, scoped to auth users.)

CREATE TABLE IF NOT EXISTS user_push_subscriptions (
  id                          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint                    TEXT        NOT NULL UNIQUE,
  p256dh                      TEXT        NOT NULL,
  auth                        TEXT        NOT NULL,
  user_agent                  TEXT,
  enabled                     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_successful_delivery_at TIMESTAMPTZ,
  last_failed_delivery_at     TIMESTAMPTZ,
  failure_count               INTEGER     NOT NULL DEFAULT 0,
  disabled_at                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS user_push_subscriptions_user_idx
  ON user_push_subscriptions (user_id, enabled, updated_at DESC);

-- One reminder per user per timed item per day (item_key embeds the date).
CREATE TABLE IF NOT EXISTS user_reminder_deliveries (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key        TEXT        NOT NULL,
  delivery_status TEXT        NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_reminder_deliveries_user_item_uniq UNIQUE (user_id, item_key)
);

CREATE INDEX IF NOT EXISTS user_reminder_deliveries_created_idx
  ON user_reminder_deliveries (created_at);

ALTER TABLE user_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reminder_deliveries ENABLE ROW LEVEL SECURITY;

-- Browsers register/unregister their own device subscriptions directly.
CREATE POLICY "Users can manage their own push subscriptions"
  ON user_push_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Deliveries are written only by the scheduled job via the service-role client;
-- no browser policies needed.
