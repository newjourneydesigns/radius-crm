-- Adds a bi-weekly anchor date to circle leaders.
-- Used by the calendar to keep bi-weekly schedules stable across views.

ALTER TABLE public.circle_leaders
  ADD COLUMN IF NOT EXISTS meeting_start_date date;
