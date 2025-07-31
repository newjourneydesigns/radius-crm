-- Check current RLS status and policies for all tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('acpd_list', 'circle_types', 'statuses', 'frequencies', 'campuses');

-- Check existing policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN ('acpd_list', 'circle_types', 'statuses', 'frequencies', 'campuses');

-- If RLS is blocking access, you can temporarily disable it for testing:
-- (Uncomment these lines one by one to test)

-- ALTER TABLE acpd_list DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE circle_types DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE statuses DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE frequencies DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE campuses DISABLE ROW LEVEL SECURITY;

-- OR create permissive policies for anonymous users:
-- CREATE POLICY "Allow anonymous read access on acpd_list" ON acpd_list FOR SELECT USING (true);
-- CREATE POLICY "Allow anonymous all access on acpd_list" ON acpd_list FOR ALL USING (true) WITH CHECK (true);

-- Repeat for other tables if needed
