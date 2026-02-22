-- Add email frequency and last-sent tracking columns to users table
-- frequency_hours: how often to send digest, starting from 12am CST (e.g. 8 = every 8 hours: 12am, 8am, 4pm CST)
-- last_digest_sent_at: timestamp of last digest sent, used to prevent double-sends

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS daily_email_frequency_hours INTEGER DEFAULT 24,
  ADD COLUMN IF NOT EXISTS last_digest_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN users.daily_email_frequency_hours IS 'Hours between digest emails, starting at 12am CST. Valid values: 4, 6, 8, 12, 24.';
COMMENT ON COLUMN users.last_digest_sent_at IS 'Timestamp of last digest email sent to this user.';
