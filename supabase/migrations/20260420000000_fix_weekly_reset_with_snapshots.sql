-- Fix weekly reset: snapshot current states before clearing, and reset event_summary_state too.
--
-- Two bugs existed in the original reset_event_summaries():
--   1. It never created a snapshot, so all past-week data was lost on rollover.
--   2. It only cleared the legacy boolean columns (event_summary_received/skipped),
--      leaving event_summary_state unchanged (the UI reads event_summary_state).
--
-- This migration replaces the function to:
--   a. Upsert snapshots for ALL circle leaders for the just-completed week.
--   b. Reset event_summary_state to 'not_received' (the legacy booleans follow via trigger).

CREATE OR REPLACE FUNCTION public.reset_event_summaries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  week_sunday DATE;
  week_saturday DATE;
BEGIN
  -- The just-completed week: the Sunday 7 days ago through yesterday (Saturday).
  -- At Sunday midnight CT, "today" is Sunday, so the completed week started last Sunday.
  week_sunday   := (CURRENT_DATE - INTERVAL '7 days')::DATE;
  week_saturday := (CURRENT_DATE - INTERVAL '1 day')::DATE;

  -- Snapshot all circle leaders for the completed week (upsert to avoid overwriting
  -- a snapshot that was manually captured via the "Reset" button earlier).
  INSERT INTO public.event_summary_snapshots (
    week_start_date,
    week_end_date,
    circle_leader_id,
    event_summary_state,
    captured_at
  )
  SELECT
    week_sunday,
    week_saturday,
    id,
    event_summary_state,
    NOW()
  FROM public.circle_leaders
  WHERE status NOT IN ('archived')
  ON CONFLICT (week_start_date, circle_leader_id)
    DO UPDATE SET
      -- Only overwrite if the existing snapshot was also system-generated
      -- (captured_by IS NULL). Manual snapshots are preserved.
      event_summary_state = CASE
        WHEN event_summary_snapshots.captured_by IS NULL
          THEN EXCLUDED.event_summary_state
        ELSE event_summary_snapshots.event_summary_state
      END,
      captured_at = CASE
        WHEN event_summary_snapshots.captured_by IS NULL
          THEN EXCLUDED.captured_at
        ELSE event_summary_snapshots.captured_at
      END;

  -- Reset the new enum column for all leaders (legacy booleans reset via trigger).
  UPDATE public.circle_leaders
  SET event_summary_state = 'not_received'
  WHERE event_summary_state != 'not_received';
END;
$$;

REVOKE ALL ON FUNCTION public.reset_event_summaries() FROM PUBLIC;
