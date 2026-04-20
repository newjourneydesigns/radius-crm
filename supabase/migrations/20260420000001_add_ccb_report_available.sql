-- Add ccb_report_available flag to event_summary_snapshots.
-- When a week's CCB attendance data is pulled, this is set to TRUE for leaders
-- who have a report in CCB that week. The event_summary_state stays manual.

ALTER TABLE event_summary_snapshots
  ADD COLUMN IF NOT EXISTS ccb_report_available BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN event_summary_snapshots.ccb_report_available IS 'TRUE when CCB shows an attendance profile was submitted for this leader this week. Set by the "Pull from CCB" action; does not auto-update event_summary_state.';
