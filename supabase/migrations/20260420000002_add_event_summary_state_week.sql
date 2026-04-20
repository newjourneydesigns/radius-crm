-- Track which week an event_summary_state was set for, so stale states
-- from prior weeks are treated as not_received on the current week.
ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS event_summary_state_week DATE;
