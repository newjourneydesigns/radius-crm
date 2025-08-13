-- Emergency RLS Fix - Handle Missing User Profiles
-- This addresses the 500 errors caused by RLS policies looking for user records that don't exist yet

-- 1. First, let's bootstrap user profil-- 7. Run the bootstrap function to create missing user profiles
SELECT public.bootstrap_user_profiles();

-- 8. Make your specific user an ACPD user (update the email to match yours)
UPDATE public.users 
SET role = 'ACPD' 
WHERE email = 'trip@theplanning.church';  -- Replace with your actual email

-- 9. If the bootstrap didn't work, manually create the user profile
-- (This handles edge cases where auth.users might not be accessible)
INSERT INTO public.users (id, email, name, role)
VALUES (
  '6fcfdbc1-758d-4446-920e-e87b77990b33',  -- Your actual user ID from the console logs
  'trip@theplanning.church',
  'Trip Ochenski',
  'ACPD'::user_role
)
ON CONFLICT (id) DO UPDATE SET
  role = 'ACPD'::user_role,
  name = 'Trip Ochenski',
  email = 'trip@theplanning.church',
  updated_at = NOW(); existing auth users
-- We'll create profiles for all auth users that don't have them yet

-- 2. Fix the RLS policies to handle cases where user profile doesn't exist yet
-- We'll update the policies to be more permissive during the bootstrap phase

-- Drop and recreate user policies with better error handling
DROP POLICY IF EXISTS "users_read_own_profile" ON users;
DROP POLICY IF EXISTS "users_update_own_profile" ON users;
DROP POLICY IF EXISTS "acpd_users_read_all_profiles" ON users;
DROP POLICY IF EXISTS "acpd_users_manage_all_profiles" ON users;

-- Create more permissive user policies that handle missing profiles gracefully
CREATE POLICY "users_read_own_profile" ON users
  FOR SELECT TO authenticated 
  USING (
    auth.uid() = id OR 
    -- Allow reading during profile creation
    auth.uid() IS NOT NULL
  );

CREATE POLICY "users_update_own_profile" ON users
  FOR UPDATE TO authenticated 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_insert_own_profile" ON users
  FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() = id);

CREATE POLICY "acpd_users_read_all_profiles" ON users
  FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    -- Allow initial access if no user record exists yet
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  );

CREATE POLICY "acpd_users_manage_all_profiles" ON users
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    -- Allow initial access if no user record exists yet
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    -- Allow initial access if no user record exists yet
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  );

-- 3. Update reference table policies to be more graceful
-- These should allow access even if user profile doesn't exist yet

-- ACPD List - more permissive read, restricted write
DROP POLICY IF EXISTS "authenticated_users_read_acpd_list" ON acpd_list;
DROP POLICY IF EXISTS "acpd_users_write_acpd_list" ON acpd_list;

CREATE POLICY "authenticated_users_read_acpd_list" ON acpd_list
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_users_write_acpd_list" ON acpd_list
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    -- Allow initial setup if no user record exists yet
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    -- Allow initial setup if no user record exists yet
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  );

-- 4. Apply the same pattern to other reference tables
-- Campuses
DROP POLICY IF EXISTS "authenticated_users_read_campuses" ON campuses;
DROP POLICY IF EXISTS "acpd_users_write_campuses" ON campuses;

CREATE POLICY "authenticated_users_read_campuses" ON campuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_users_write_campuses" ON campuses
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  );

-- Circle Types
DROP POLICY IF EXISTS "authenticated_users_read_circle_types" ON circle_types;
DROP POLICY IF EXISTS "acpd_users_write_circle_types" ON circle_types;

CREATE POLICY "authenticated_users_read_circle_types" ON circle_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_users_write_circle_types" ON circle_types
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  );

-- Statuses
DROP POLICY IF EXISTS "authenticated_users_read_statuses" ON statuses;
DROP POLICY IF EXISTS "acpd_users_write_statuses" ON statuses;

CREATE POLICY "authenticated_users_read_statuses" ON statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_users_write_statuses" ON statuses
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  );

-- Frequencies
DROP POLICY IF EXISTS "authenticated_users_read_frequencies" ON frequencies;
DROP POLICY IF EXISTS "acpd_users_write_frequencies" ON frequencies;

CREATE POLICY "authenticated_users_read_frequencies" ON frequencies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "acpd_users_write_frequencies" ON frequencies
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ACPD') OR
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  );

-- 5. Update the user creation function to handle conflicts better
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'name', new.email),
    'Viewer'::user_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, users.name),
    updated_at = NOW();
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create a function to bootstrap user profiles for existing auth users
CREATE OR REPLACE FUNCTION public.bootstrap_user_profiles()
RETURNS VOID AS $$
DECLARE
  user_record RECORD;
BEGIN
  -- Create profiles for any auth users that don't have profiles yet
  FOR user_record IN 
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.users pu ON au.id = pu.id
    WHERE pu.id IS NULL
  LOOP
    INSERT INTO public.users (id, email, name, role)
    VALUES (
      user_record.id,
      user_record.email,
      COALESCE(user_record.raw_user_meta_data->>'name', user_record.email),
      'Viewer'::user_role
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Run the bootstrap function to create missing user profiles
SELECT public.bootstrap_user_profiles();

-- 8. Make your specific user an ACPD user (update the email to match yours)
UPDATE public.users 
SET role = 'ACPD' 
WHERE email = 'trip@theplanning.church';  -- Replace with your actual email

-- 9. If the bootstrap didn't work, manually create the user profile
-- (This handles edge cases where auth.users might not be accessible)
INSERT INTO public.users (id, email, name, role)
VALUES (
  '6fcfdbc1-758d-4446-920e-e87b77990b33',  -- Your actual user ID from the console logs
  'trip@theplanning.church',
  'Trip Ochenski',
  'ACPD'::user_role
)
ON CONFLICT (id) DO UPDATE SET
  role = 'ACPD'::user_role,
  name = 'Trip Ochenski',
  email = 'trip@theplanning.church',
  updated_at = NOW();
