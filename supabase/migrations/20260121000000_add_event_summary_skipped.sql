-- Add tri-state support for event summaries (received / not received / skipped)
-- This keeps existing `event_summary_received` and adds `event_summary_skipped`.

ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS event_summary_skipped BOOLEAN DEFAULT FALSE;

-- Backfill any NULLs to FALSE for safety
UPDATE circle_leaders
SET event_summary_skipped = FALSE
WHERE event_summary_skipped IS NULL;

-- Optional hardening: ensure we never store NULLs going forward
ALTER TABLE circle_leaders
  ALTER COLUMN event_summary_skipped SET NOT NULL;

-- Prevent impossible state (both received and skipped)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'circle_leaders_event_summary_state_check'
  ) THEN
    ALTER TABLE circle_leaders
      ADD CONSTRAINT circle_leaders_event_summary_state_check
      CHECK (NOT (event_summary_received IS TRUE AND event_summary_skipped IS TRUE));
  END IF;
END $$;
