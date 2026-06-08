-- Circle Summary emails now send one summary reminder 30 minutes after the
-- event start. Rename persisted legacy reminder rows so old sends continue
-- to dedupe under the new summary_reminder kind.

DELETE FROM circle_reminder_sends a
USING circle_reminder_sends b
WHERE a.kind IN ('summary_reminder', 'follow_up', 'pre_meeting')
  AND b.kind IN ('summary_reminder', 'follow_up', 'pre_meeting')
  AND a.leader_id = b.leader_id
  AND a.ccb_event_id = b.ccb_event_id
  AND a.occurrence_date = b.occurrence_date
  AND (
    a.sent_at > b.sent_at
    OR (a.sent_at = b.sent_at AND a.id::text > b.id::text)
  );

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'circle_reminder_sends'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%kind%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.circle_reminder_sends DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

UPDATE circle_reminder_sends
SET kind = 'summary_reminder'
WHERE kind IN ('follow_up', 'pre_meeting');

DROP INDEX IF EXISTS circle_reminder_sends_summary_reminder_uniq;
CREATE UNIQUE INDEX circle_reminder_sends_summary_reminder_uniq
  ON circle_reminder_sends (leader_id, ccb_event_id, occurrence_date)
  WHERE kind = 'summary_reminder';

ALTER TABLE circle_reminder_sends
  ADD CONSTRAINT circle_reminder_sends_kind_check
  CHECK (kind = 'summary_reminder');
