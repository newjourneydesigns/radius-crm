-- Circle Summary Inbox scheduling support.
-- Messages can be composed now and delivered at a future date/time. A scheduled
-- message stays hidden from leaders (status = 'scheduled') with no recipient rows
-- until a worker delivers it: it then resolves recipients, fires pushes, and flips
-- status to 'sent'. scheduled_at is stored in UTC; the composer anchors the chosen
-- wall-clock time to America/Chicago (church time) before saving.

ALTER TABLE circle_summary_inbox_messages
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Widen the status check to allow 'scheduled' alongside 'sent'/'unsent'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'circle_summary_inbox_messages_status_check'
  ) THEN
    ALTER TABLE circle_summary_inbox_messages
      DROP CONSTRAINT circle_summary_inbox_messages_status_check;
  END IF;

  ALTER TABLE circle_summary_inbox_messages
    ADD CONSTRAINT circle_summary_inbox_messages_status_check
    CHECK (status IN ('sent', 'unsent', 'scheduled'));
END $$;

-- Partial index for the delivery worker's "due scheduled messages" query.
CREATE INDEX IF NOT EXISTS circle_summary_inbox_messages_scheduled_idx
  ON circle_summary_inbox_messages (scheduled_at)
  WHERE status = 'scheduled';
