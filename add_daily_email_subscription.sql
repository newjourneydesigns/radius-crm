-- ============================================================
-- Add Daily Email Subscription to Users Table
-- Run this in your Supabase SQL editor
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS daily_email_subscribed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS daily_email_time TEXT DEFAULT '08:00';

COMMENT ON COLUMN users.daily_email_subscribed IS 'Whether this user receives the daily personal digest email';
COMMENT ON COLUMN users.daily_email_time IS 'Preferred send time (for future use)';
