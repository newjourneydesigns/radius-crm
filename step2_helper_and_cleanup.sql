-- STEP 2: Create helper function and drop old policies (paste this second)
CREATE OR REPLACE FUNCTION public.is_user_acpd(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.get_user_role_bypass_rls(user_id) = 'ACPD';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "users_read_own_profile" ON users;
DROP POLICY IF EXISTS "users_update_own_profile" ON users;
DROP POLICY IF EXISTS "users_insert_own_profile" ON users;
DROP POLICY IF EXISTS "acpd_users_read_all_profiles" ON users;
DROP POLICY IF EXISTS "acpd_users_manage_all_profiles" ON users;
