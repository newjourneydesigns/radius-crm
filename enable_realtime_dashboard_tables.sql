-- Enable Supabase Realtime for Dashboard + Circle Detail Tables
-- Run this in your Supabase SQL Editor to allow real-time subscriptions.
-- Safe to re-run — skips tables that are already members.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'circle_leaders',
    'todo_items',
    'notes',
    'user_notes',
    'circle_visits',
    'acpd_prayer_points',
    'acpd_encouragements',
    'acpd_coaching_notes',
    'circle_leader_scores'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
      RAISE NOTICE 'Added % to supabase_realtime', tbl;
    ELSE
      RAISE NOTICE '% already in supabase_realtime — skipped', tbl;
    END IF;
  END LOOP;
END $$;

-- Note: RLS policies already allow SELECT for authenticated users on all
-- tables, so Supabase Realtime (which respects RLS) will correctly
-- deliver change events to connected clients.
--
-- To verify the publication afterwards:
--   SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
