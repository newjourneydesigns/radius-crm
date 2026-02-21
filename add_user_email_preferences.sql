-- ============================================================
-- Add User Email Preferences Table
-- Stores individual user preferences for daily summary emails
-- ============================================================

-- Create user_email_preferences table
CREATE TABLE IF NOT EXISTS user_email_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  email_address TEXT, -- Optional: override user's primary email
  
  -- Sections to include in daily email
  include_follow_ups BOOLEAN DEFAULT true,
  include_overdue_tasks BOOLEAN DEFAULT true,
  include_planned_encouragements BOOLEAN DEFAULT true,
  include_upcoming_meetings BOOLEAN DEFAULT false,
  
  -- Email timing preferences
  preferred_time TEXT DEFAULT '08:00', -- HH:MM format
  timezone TEXT DEFAULT 'UTC',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE user_email_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read their own preferences
CREATE POLICY "Users can view own email preferences"
  ON user_email_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert own email preferences"
  ON user_email_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own email preferences"
  ON user_email_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ACPD users can view all preferences (for admin purposes)
CREATE POLICY "ACPD can view all email preferences"
  ON user_email_preferences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'ACPD'
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_email_preferences_user_id ON user_email_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_email_preferences_enabled ON user_email_preferences(email_enabled) WHERE email_enabled = true;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_email_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_email_preferences_updated_at ON user_email_preferences;
CREATE TRIGGER trigger_update_user_email_preferences_updated_at
  BEFORE UPDATE ON user_email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_email_preferences_updated_at();

COMMENT ON TABLE user_email_preferences IS 'Stores user preferences for daily summary emails';
COMMENT ON COLUMN user_email_preferences.email_enabled IS 'Whether user wants to receive daily emails';
COMMENT ON COLUMN user_email_preferences.email_address IS 'Optional override email address (defaults to user.email)';
COMMENT ON COLUMN user_email_preferences.include_follow_ups IS 'Include circle leaders requiring follow-up';
COMMENT ON COLUMN user_email_preferences.include_overdue_tasks IS 'Include overdue todo items';
COMMENT ON COLUMN user_email_preferences.include_planned_encouragements IS 'Include planned encouragements for today';
COMMENT ON COLUMN user_email_preferences.include_upcoming_meetings IS 'Include upcoming meeting reminders';
