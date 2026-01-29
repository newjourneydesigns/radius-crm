-- Create event_summary_followups table to track which reminder messages have been sent
CREATE TABLE IF NOT EXISTS event_summary_followups (
  id SERIAL PRIMARY KEY,
  circle_leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  message_number INTEGER NOT NULL CHECK (message_number IN (1, 2, 3)),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_by UUID NOT NULL REFERENCES auth.users(id),
  week_start_date DATE NOT NULL, -- Saturday at 11:59:59 PM CT when this week started
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_event_summary_followups_leader_week 
  ON event_summary_followups(circle_leader_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_event_summary_followups_week 
  ON event_summary_followups(week_start_date);

-- Enable RLS
ALTER TABLE event_summary_followups ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view followups for their leaders" ON event_summary_followups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM circle_leaders cl
      WHERE cl.id = event_summary_followups.circle_leader_id
    )
  );

CREATE POLICY "Users can insert their own followups" ON event_summary_followups
  FOR INSERT WITH CHECK (
    sent_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM circle_leaders cl
      WHERE cl.id = event_summary_followups.circle_leader_id
    )
  );

-- Function to get the Saturday (start of week) for any given date
-- This ensures all followups in the same week have the same week_start_date
-- Week resets at Saturday 11:59:59 PM CT
CREATE OR REPLACE FUNCTION get_week_start_date(input_date DATE)
RETURNS DATE AS $$
BEGIN
  -- Get the most recent Saturday (or today if it's Saturday)
  -- Saturday = 6 in PostgreSQL (0=Sunday, 6=Saturday)
  RETURN input_date - ((EXTRACT(DOW FROM input_date)::INTEGER + 1) % 7);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON TABLE event_summary_followups IS 'Tracks which event summary reminder messages have been sent to circle leaders each week. Resets every Saturday at 11:59:59 PM CT or when event summary is marked as received.';
COMMENT ON COLUMN event_summary_followups.message_number IS 'Which reminder message was sent (1, 2, or 3)';
COMMENT ON COLUMN event_summary_followups.week_start_date IS 'The Saturday at 11:59:59 PM CT that marks the start of this week - used for weekly reset logic';
