-- Circle Summary Inbox unsend support.
-- Unsent messages are hidden from leader inboxes but kept editable in RADIUS.

ALTER TABLE circle_summary_inbox_messages
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS unsent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resent_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'circle_summary_inbox_messages_status_check'
  ) THEN
    ALTER TABLE circle_summary_inbox_messages
      ADD CONSTRAINT circle_summary_inbox_messages_status_check
      CHECK (status IN ('sent', 'unsent'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS circle_summary_inbox_messages_status_idx
  ON circle_summary_inbox_messages (status, updated_at DESC);
