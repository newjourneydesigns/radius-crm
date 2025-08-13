-- Fix Infinite Recursion in RLS Policies
-- The issue is that our policies are trying to query the users table to check roles,
-- but the users table itself has RLS policies that also check roles - creating infinite recursion

-- 1. First, let's create a simple function that can bypass RLS to check user roles
CREATE OR REPLACE FUNCTION public.get_user_role_bypass_rls(user_id UUID)
RETURNS user_role AS $$
DECLARE
  user_role_result user_role;
BEGIN
  -- This function runs with SECURITY DEFINER and can bypass RLS
  SELECT role INTO user_role_result 
  FROM public.users 
  WHERE id = user_id;
  
  RETURN COALESCE(user_role_result, 'Viewer'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create a simpler function to check if user is ACPD without recursion
CREATE OR REPLACE FUNCTION public.is_user_acpd(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.get_user_role_bypass_rls(user_id) = 'ACPD';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Drop ALL existing policies on users table to start fresh
DROP POLICY IF EXISTS "users_read_own_profile" ON users;
DROP POLICY IF EXISTS "users_update_own_profile" ON users;
DROP POLICY IF EXISTS "users_insert_own_profile" ON users;
DROP POLICY IF EXISTS "acpd_users_read_all_profiles" ON users;
DROP POLICY IF EXISTS "acpd_users_manage_all_profiles" ON users;

-- 4. Create simple, non-recursive policies for users table
-- Allow authenticated users to read their own profile and ACPD users to read all
CREATE POLICY "users_select" ON users
  FOR SELECT TO authenticated 
  USING (
    auth.uid() = id OR 
    public.is_user_acpd(auth.uid())
  );

-- Allow users to update their own profile and ACPD users to update all
CREATE POLICY "users_update" ON users
  FOR UPDATE TO authenticated 
  USING (
    auth.uid() = id OR 
    public.is_user_acpd(auth.uid())
  )
  WITH CHECK (
    auth.uid() = id OR 
    public.is_user_acpd(auth.uid())
  );

-- Allow users to insert their own profile
CREATE POLICY "users_insert" ON users
  FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() = id);

-- Allow ACPD users to delete profiles
CREATE POLICY "users_delete" ON users
  FOR DELETE TO authenticated 
  USING (public.is_user_acpd(auth.uid()));

-- 5. Update other table policies to use the new function
-- ACPD List
DROP POLICY IF EXISTS "authenticated_users_read_acpd_list" ON acpd_list;
DROP POLICY IF EXISTS "acpd_users_write_acpd_list" ON acpd_list;

CREATE POLICY "acpd_list_select" ON acpd_list
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_list_modify" ON acpd_list
  FOR ALL TO authenticated 
  USING (public.is_user_acpd(auth.uid()))
  WITH CHECK (public.is_user_acpd(auth.uid()));

-- Campuses
DROP POLICY IF EXISTS "authenticated_users_read_campuses" ON campuses;
DROP POLICY IF EXISTS "acpd_users_write_campuses" ON campuses;

CREATE POLICY "campuses_select" ON campuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "campuses_modify" ON campuses
  FOR ALL TO authenticated 
  USING (public.is_user_acpd(auth.uid()))
  WITH CHECK (public.is_user_acpd(auth.uid()));

-- Circle Types
DROP POLICY IF EXISTS "authenticated_users_read_circle_types" ON circle_types;
DROP POLICY IF EXISTS "acpd_users_write_circle_types" ON circle_types;

CREATE POLICY "circle_types_select" ON circle_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "circle_types_modify" ON circle_types
  FOR ALL TO authenticated 
  USING (public.is_user_acpd(auth.uid()))
  WITH CHECK (public.is_user_acpd(auth.uid()));

-- Statuses
DROP POLICY IF EXISTS "authenticated_users_read_statuses" ON statuses;
DROP POLICY IF EXISTS "acpd_users_write_statuses" ON statuses;

CREATE POLICY "statuses_select" ON statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "statuses_modify" ON statuses
  FOR ALL TO authenticated 
  USING (public.is_user_acpd(auth.uid()))
  WITH CHECK (public.is_user_acpd(auth.uid()));

-- Frequencies
DROP POLICY IF EXISTS "authenticated_users_read_frequencies" ON frequencies;
DROP POLICY IF EXISTS "acpd_users_write_frequencies" ON frequencies;

CREATE POLICY "frequencies_select" ON frequencies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "frequencies_modify" ON frequencies
  FOR ALL TO authenticated 
  USING (public.is_user_acpd(auth.uid()))
  WITH CHECK (public.is_user_acpd(auth.uid()));

-- Connection Types
DROP POLICY IF EXISTS "authenticated_users_read_connection_types" ON connection_types;
DROP POLICY IF EXISTS "acpd_users_write_connection_types" ON connection_types;

CREATE POLICY "connection_types_select" ON connection_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "connection_types_modify" ON connection_types
  FOR ALL TO authenticated 
  USING (public.is_user_acpd(auth.uid()))
  WITH CHECK (public.is_user_acpd(auth.uid()));

-- Connections (main table with data)
DROP POLICY IF EXISTS "authenticated_users_read_connections" ON connections;
DROP POLICY IF EXISTS "authenticated_users_write_connections" ON connections;
DROP POLICY IF EXISTS "authenticated_users_update_connections" ON connections;
DROP POLICY IF EXISTS "acpd_users_delete_connections" ON connections;

CREATE POLICY "connections_select" ON connections
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "connections_insert" ON connections
  FOR INSERT TO authenticated 
  WITH CHECK (true);

CREATE POLICY "connections_update" ON connections
  FOR UPDATE TO authenticated 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "connections_delete" ON connections
  FOR DELETE TO authenticated 
  USING (public.is_user_acpd(auth.uid()));

-- 6. Verify your user profile exists with ACPD role
INSERT INTO public.users (id, email, name, role)
VALUES (
  '6fcfdbc1-758d-4446-920e-e87b77990b33',
  'trip@theplanning.church',
  'Trip Ochenski',
  'ACPD'::user_role
)
ON CONFLICT (id) DO UPDATE SET
  role = 'ACPD'::user_role,
  name = 'Trip Ochenski',
  email = 'trip@theplanning.church',
  updated_at = NOW();

-- 7. Test the function to make sure it works
SELECT 
  'Testing user role function:' as test,
  public.get_user_role_bypass_rls('6fcfdbc1-758d-4446-920e-e87b77990b33') as your_role,
  public.is_user_acpd('6fcfdbc1-758d-4446-920e-e87b77990b33') as is_acpd;
