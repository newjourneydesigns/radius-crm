-- Enable Supabase Realtime for Dashboard Tables
-- Run this in your Supabase SQL Editor to allow real-time subscriptions
-- on the tables the dashboard listens to.

-- Core dashboard entities
ALTER PUBLICATION supabase_realtime ADD TABLE circle_leaders;
ALTER PUBLICATION supabase_realtime ADD TABLE todo_items;
ALTER PUBLICATION supabase_realtime ADD TABLE notes;
ALTER PUBLICATION supabase_realtime ADD TABLE user_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE circle_visits;

-- Note: RLS policies already allow SELECT for authenticated users on all
-- five tables, so Supabase Realtime (which respects RLS) will correctly
-- deliver change events to connected clients.
--
-- To verify the publication afterwards:
--   SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
