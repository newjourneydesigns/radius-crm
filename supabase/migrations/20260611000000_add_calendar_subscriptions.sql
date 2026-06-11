-- calendar_subscriptions
-- External ICS/webcal feeds a user subscribes to. Events from these feeds are
-- rendered on the Today page timeline. The URL is the credential (secret iCal
-- address from Google/Outlook/Apple), so rows are strictly per-user.

CREATE TABLE IF NOT EXISTS calendar_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  url        text        NOT NULL,
  color      text        NOT NULL DEFAULT '#3b82f6',
  is_enabled boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_subscriptions_user_id
  ON calendar_subscriptions(user_id);

ALTER TABLE calendar_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read and modify their own subscriptions
CREATE POLICY "Users can manage their own calendar subscriptions"
  ON calendar_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
