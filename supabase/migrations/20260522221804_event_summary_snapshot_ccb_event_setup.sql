-- Preserve the distinction between a CCB event occurrence and a submitted
-- attendance report. `ccb_report_available` only covers the latter.

ALTER TABLE event_summary_snapshots
  ADD COLUMN IF NOT EXISTS ccb_event_scheduled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN event_summary_snapshots.ccb_event_scheduled IS
  'TRUE when CCB has a matching event occurrence for this leader and week, even if no attendance report has been submitted.';
