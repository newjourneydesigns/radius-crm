-- Add columns to persist email content section preferences
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS include_follow_ups boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_overdue_tasks boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_planned_encouragements boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_upcoming_meetings boolean NOT NULL DEFAULT false;
