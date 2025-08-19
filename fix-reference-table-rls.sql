-- Fix RLS policies for reference tables to allow authenticated users full access

-- Circle Types table
DROP POLICY IF EXISTS "Allow all operations on circle_types" ON circle_types;
DROP POLICY IF EXISTS "authenticated_users_read_circle_types" ON circle_types;
DROP POLICY IF EXISTS "circle_types_select" ON circle_types;
DROP POLICY IF EXISTS "circle_types_modify" ON circle_types;

CREATE POLICY "authenticated_read_circle_types" ON circle_types
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_modify_circle_types" ON circle_types
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Statuses table
DROP POLICY IF EXISTS "Allow all operations on statuses" ON statuses;
DROP POLICY IF EXISTS "authenticated_users_read_statuses" ON statuses;
DROP POLICY IF EXISTS "statuses_select" ON statuses;
DROP POLICY IF EXISTS "statuses_modify" ON statuses;

CREATE POLICY "authenticated_read_statuses" ON statuses
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_modify_statuses" ON statuses
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Frequencies table
DROP POLICY IF EXISTS "Allow all operations on frequencies" ON frequencies;
DROP POLICY IF EXISTS "authenticated_users_read_frequencies" ON frequencies;
DROP POLICY IF EXISTS "frequencies_select" ON frequencies;
DROP POLICY IF EXISTS "frequencies_modify" ON frequencies;

CREATE POLICY "authenticated_read_frequencies" ON frequencies
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_modify_frequencies" ON frequencies
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Campuses table
DROP POLICY IF EXISTS "Allow all operations on campuses" ON campuses;
DROP POLICY IF EXISTS "authenticated_users_read_campuses" ON campuses;
DROP POLICY IF EXISTS "campuses_select" ON campuses;
DROP POLICY IF EXISTS "campuses_modify" ON campuses;

CREATE POLICY "authenticated_read_campuses" ON campuses
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_modify_campuses" ON campuses
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ACPD List table
DROP POLICY IF EXISTS "Allow all operations on acpd_list" ON acpd_list;
DROP POLICY IF EXISTS "authenticated_users_read_acpd_list" ON acpd_list;
DROP POLICY IF EXISTS "acpd_list_select" ON acpd_list;
DROP POLICY IF EXISTS "acpd_list_modify" ON acpd_list;
DROP POLICY IF EXISTS "acpd_users_write_acpd_list" ON acpd_list;

CREATE POLICY "authenticated_read_acpd_list" ON acpd_list
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_modify_acpd_list" ON acpd_list
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
