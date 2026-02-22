-- ============================================================
-- Fix Users Table Insert Policy for Admin User Creation
-- Allow ACPD users to create profiles for new invited users
-- ============================================================

-- Drop the restrictive insert policy
DROP POLICY IF EXISTS "users_insert" ON users;

-- Create new policy that allows:
-- 1. Users to insert their own profile (auth.uid() = id)
-- 2. ACPD users to insert profiles for any user (for invitations)
CREATE POLICY "users_insert" ON users
  FOR INSERT TO authenticated 
  WITH CHECK (
    auth.uid() = id OR 
    public.is_user_acpd(auth.uid())
  );

-- Add a comment to explain the policy
COMMENT ON POLICY "users_insert" ON users IS 
  'Allows users to create their own profile and ACPD admins to create profiles for invited users';

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_insert';
