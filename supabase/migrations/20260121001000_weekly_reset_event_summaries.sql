-- Weekly reset of event summary state (received/skipped) at Sunday 12:00am Central Time
--
-- We schedule an hourly pg_cron job and only execute the reset when the
-- current time in America/Chicago is Sunday 00:00. This keeps behavior
-- aligned with Central Time across DST changes.

CREATE OR REPLACE FUNCTION public.reset_event_summaries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  UPDATE public.circle_leaders
  SET
    event_summary_received = FALSE,
    event_summary_skipped = FALSE
  WHERE
    COALESCE(event_summary_received, FALSE) IS TRUE
    OR COALESCE(event_summary_skipped, FALSE) IS TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_event_summaries() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.reset_event_summaries_weekly_guard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  local_now timestamp;
BEGIN
  -- Convert to Central US time (America/Chicago) so DST is handled correctly
  local_now := (NOW() AT TIME ZONE 'America/Chicago');

  -- In Postgres: Sunday = 0
  IF EXTRACT(DOW FROM local_now) = 0
     AND EXTRACT(HOUR FROM local_now) = 0
     AND EXTRACT(MINUTE FROM local_now) = 0 THEN
    PERFORM public.reset_event_summaries();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_event_summaries_weekly_guard() FROM PUBLIC;

DO $$
DECLARE
  schedule_command text := $cmd$SELECT public.reset_event_summaries_weekly_guard();$cmd$;
  existing_job_id bigint;
BEGIN
  -- Attempt to enable pg_cron if available. (On Supabase you may need to enable
  -- it in Dashboard -> Database -> Extensions.)
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Insufficient privilege to CREATE EXTENSION pg_cron. Enable it via Supabase Dashboard.';
    WHEN others THEN
      -- Do not fail the migration if extension operations are blocked.
      RAISE NOTICE 'Unable to create/verify pg_cron extension: %', SQLERRM;
  END;

  -- If pg_cron isn't installed/available, skip scheduling.
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE 'cron schema not found; skipping weekly reset scheduling.';
    RETURN;
  END IF;

  -- If cron.job has jobname, use it. Otherwise, fall back to matching by command.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'cron'
      AND table_name = 'job'
      AND column_name = 'jobname'
  ) THEN
    SELECT jobid
    INTO existing_job_id
    FROM cron.job
    WHERE jobname = 'reset_event_summaries_weekly'
    LIMIT 1;

    IF existing_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(existing_job_id);
    END IF;

    -- Run hourly (minute 0). The guard function enforces Sunday 12:00am CT.
    PERFORM cron.schedule(
      'reset_event_summaries_weekly',
      '0 * * * *',
      schedule_command
    );
  ELSE
    -- Older pg_cron: no jobname column. Try to unschedule any existing job with the same command.
    SELECT jobid
    INTO existing_job_id
    FROM cron.job
    WHERE command = schedule_command
    LIMIT 1;

    IF existing_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(existing_job_id);
    END IF;

    PERFORM cron.schedule(
      '0 * * * *',
      schedule_command
    );
  END IF;
END $$;
