-- Add has_notes and guest_count to circle_meeting_occurrences
-- Populated during CCB pull/auto-update to drive Missing Notes and Guest Listed badges

ALTER TABLE circle_meeting_occurrences
  ADD COLUMN IF NOT EXISTS has_notes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_count integer NOT NULL DEFAULT 0;
