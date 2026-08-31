-- ============================================================================
-- student_ministry_groups.kind — add 'leaders'
--
-- /import-students needs to know which CCB group holds a campus's student
-- LEADERS, the same way the toolkit knows which groups hold their students.
-- That map already exists (student_ministry_groups); it just had no kind for
-- it, so this widens the CHECK rather than adding a second config table.
--
-- 20260831000000_student_toolkit_roster.sql created the CHECK inline inside
-- CREATE TABLE, so Postgres generated its name. Look it up rather than assume,
-- then re-add under an explicit name so the next widening is a one-liner.
-- ============================================================================

DO $$
DECLARE
  con_name TEXT;
BEGIN
  IF to_regclass('public.student_ministry_groups') IS NULL THEN
    RAISE EXCEPTION 'student_ministry_groups is missing — run 20260831000000_student_toolkit_roster.sql first';
  END IF;

  FOR con_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'student_ministry_groups'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.student_ministry_groups DROP CONSTRAINT %I', con_name);
  END LOOP;

  ALTER TABLE public.student_ministry_groups
    ADD CONSTRAINT student_ministry_groups_kind_check
    CHECK (kind IN ('circle', 'movement', 'leaders'));
END $$;

-- ----------------------------------------------------------------------------
-- A leaders group is an import source, never an attendance source.
--
-- lib/student-toolkit/attendance-sync.ts walks EVERY active row for the term
-- without filtering on kind, so an active 'leaders' row would:
--   1. write the leaders into student_directory_cache as if they were students,
--      putting them in every leader's roster candidate picker;
--   2. flag them via the `in_movement_group` column (the sync's else-branch for
--      any kind that isn't 'circle') — and that write first clears the flag for
--      the whole campus, so a leaders group syncing after the movement group
--      silently wipes real movement membership; and
--   3. fail on insert, because student_attendance.kind still allows only
--      'circle' | 'movement' — leaving a permanent last_sync_error on the row.
--
-- Encoding the rule here rather than only in the admin route means no future
-- caller can turn one on by accident. Drop this constraint at the same time
-- attendance-sync learns to filter kinds — not before.
-- ----------------------------------------------------------------------------
ALTER TABLE public.student_ministry_groups
  DROP CONSTRAINT IF EXISTS student_ministry_groups_leaders_not_synced_check;

UPDATE public.student_ministry_groups SET active = FALSE WHERE kind = 'leaders' AND active;

ALTER TABLE public.student_ministry_groups
  ADD CONSTRAINT student_ministry_groups_leaders_not_synced_check
  CHECK (kind <> 'leaders' OR active = FALSE);
