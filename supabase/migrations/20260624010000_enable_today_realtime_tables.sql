-- Enable Supabase Realtime for all tables that feed the Today page.
-- Safe to re-run: skips missing tables and tables already in the publication.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'circle_visits',
    'acpd_encouragements',
    'notes',
    'acpd_prayer_points',
    'general_prayer_points',
    'circle_leaders',
    'project_boards',
    'card_assignments',
    'board_cards',
    'card_checklists',
    'card_label_assignments',
    'board_labels',
    'board_columns',
    'today_big_three_slots'
  ]
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NULL THEN
      RAISE NOTICE 'Table public.% does not exist; skipped', tbl;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      RAISE NOTICE 'Added public.% to supabase_realtime', tbl;
    ELSE
      RAISE NOTICE 'public.% already in supabase_realtime; skipped', tbl;
    END IF;
  END LOOP;
END $$;
