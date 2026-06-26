-- Add a free-form note field to campaign people rows.
-- This is separate from contact_note (which is tied to the Follow Up workflow).
ALTER TABLE follow_up_campaign_people
  ADD COLUMN IF NOT EXISTS note TEXT;
