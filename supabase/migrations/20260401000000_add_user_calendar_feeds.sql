-- user_calendar_feeds
-- Stores a per-user iCal feed token and board selection for Outlook/calendar subscriptions.
-- The token is a stable UUID baked into the feed URL — it acts as the credential
-- for the public (unauthenticated) iCal export endpoint.

CREATE TABLE IF NOT EXISTS user_calendar_feeds (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token              uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  included_board_ids uuid[]      NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_calendar_feeds_user_id_unique UNIQUE(user_id)
);

ALTER TABLE user_calendar_feeds ENABLE ROW LEVEL SECURITY;

-- Users can only read and modify their own feed config
CREATE POLICY "Users can manage their own calendar feed"
  ON user_calendar_feeds
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Keep updated_at current
CREATE OR REPLACE FUNCTION update_user_calendar_feed_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_calendar_feeds_updated_at
  BEFORE UPDATE ON user_calendar_feeds
  FOR EACH ROW EXECUTE FUNCTION update_user_calendar_feed_updated_at();
