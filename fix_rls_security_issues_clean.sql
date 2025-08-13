-- Fix RLS Security Issues
-- This script addresses all the security warnings from Supabase linter

-- 1. Enable RLS on all tables that have policies but don't have RLS enabled
ALTER TABLE acpd_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 2. Check existing policies and drop conflicting ones if they exist
-- (We'll recreate them with proper naming and structure)

-- Drop existing policies on acpd_list if they exist
DROP POLICY IF EXISTS "Allow all access on acpd_list" ON acpd_list;
DROP POLICY IF EXISTS "Authenticated users have full access to acpd list" ON acpd_list;
DROP POLICY IF EXISTS "Everyone can read acpd list" ON acpd_list;

-- Drop existing policies on campuses if they exist
DROP POLICY IF EXISTS "Allow all access on campuses" ON campuses;

-- Drop existing policies on circle_types if they exist
DROP POLICY IF EXISTS "Allow all access on circle_types" ON circle_types;

-- Drop existing policies on connection_types if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users on connection_types" ON connection_types;

-- Drop existing policies on connections if they exist
DROP POLICY IF EXISTS "Enable all operations for authenticated users on connections" ON connections;

-- Drop existing policies on frequencies if they exist
DROP POLICY IF EXISTS "Allow all access on frequencies" ON frequencies;

-- Drop existing policies on statuses if they exist
DROP POLICY IF EXISTS "Allow all access on statuses" ON statuses;

-- Drop existing policies on users if they exist (we'll recreate proper ones)
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;

-- 3. Create comprehensive RLS policies for reference tables
-- These are lookup tables, so we allow read access to authenticated users

-- ACPD List policies
CREATE POLICY "authenticated_users_read_acpd_list" ON acpd_list
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_users_write_acpd_list" ON acpd_list
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'));

-- Campuses policies
CREATE POLICY "authenticated_users_read_campuses" ON campuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_users_write_campuses" ON campuses
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'));

-- Circle Types policies
CREATE POLICY "authenticated_users_read_circle_types" ON circle_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_users_write_circle_types" ON circle_types
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'));

-- Connection Types policies
CREATE POLICY "authenticated_users_read_connection_types" ON connection_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_users_write_connection_types" ON connection_types
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'));

-- Connections policies
CREATE POLICY "authenticated_users_read_connections" ON connections
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_users_write_connections" ON connections
  FOR INSERT TO authenticated 
  WITH CHECK (true);

CREATE POLICY "authenticated_users_update_connections" ON connections
  FOR UPDATE TO authenticated 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "acpd_users_delete_connections" ON connections
  FOR DELETE TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'));

-- Frequencies policies
CREATE POLICY "authenticated_users_read_frequencies" ON frequencies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_users_write_frequencies" ON frequencies
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'));

-- Statuses policies
CREATE POLICY "authenticated_users_read_statuses" ON statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_users_write_statuses" ON statuses
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'));

-- 4. Create proper Users table policies
CREATE POLICY "users_read_own_profile" ON users
  FOR SELECT TO authenticated 
  USING (auth.uid() = id);

CREATE POLICY "users_update_own_profile" ON users
  FOR UPDATE TO authenticated 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "acpd_users_read_all_profiles" ON users
  FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'));

CREATE POLICY "acpd_users_manage_all_profiles" ON users
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD'));

-- 5. Verify RLS is enabled on all tables
-- You can run this to check the status after applying the above changes:
/*
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN 'ENABLED'
    ELSE 'DISABLED'
  END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('acpd_list', 'campuses', 'circle_types', 'connection_types', 'connections', 'frequencies', 'statuses', 'users')
ORDER BY tablename;
*/

-- 6. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE ON circle_leaders TO authenticated;
GRANT INSERT, UPDATE, DELETE ON notes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON connections TO authenticated;
GRANT INSERT, UPDATE ON users TO authenticated;

-- For reference tables, only ACPD users can modify
GRANT INSERT, UPDATE, DELETE ON acpd_list TO authenticated;
GRANT INSERT, UPDATE, DELETE ON campuses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON circle_types TO authenticated;
GRANT INSERT, UPDATE, DELETE ON connection_types TO authenticated;
GRANT INSERT, UPDATE, DELETE ON frequencies TO authenticated;
GRANT INSERT, UPDATE, DELETE ON statuses TO authenticated;

-- Grant usage on sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 7. Create or update the function to handle new users (if it doesn't exist)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'name', new.email),
    'Viewer'::user_role  -- Default role using the correct enum type
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Create a function to check if user is ACPD (for easier policy management)
CREATE OR REPLACE FUNCTION public.is_acpd(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = user_id AND role = 'ACPD'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Comments for documentation
COMMENT ON FUNCTION public.is_acpd IS 'Helper function to check if a user has ACPD role';
COMMENT ON FUNCTION public.handle_new_user IS 'Automatically creates user profile when new user signs up';

-- 10. Create a view for checking RLS status (optional, for monitoring)
CREATE OR REPLACE VIEW public.rls_status AS
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  (SELECT count(*) FROM pg_policies WHERE schemaname = pg_tables.schemaname AND tablename = pg_tables.tablename) as policy_count
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

COMMENT ON VIEW public.rls_status IS 'View to monitor RLS status and policy count for all public tables';
