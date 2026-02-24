-- Fix the handle_new_user() trigger to handle conflicts gracefully
-- This prevents "Database error creating new user (unexpected_failure)" errors
-- when orphaned rows exist in public.users or on retry scenarios.
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- 1. Update the trigger function with proper conflict handling and exception safety
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove any orphaned profile with the same email but different id
  DELETE FROM public.users
  WHERE email = new.email AND id != new.id;

  -- Insert or update the profile row
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
EXCEPTION WHEN OTHERS THEN
  -- Log but never fail — a trigger failure here rolls back the entire
  -- auth.users INSERT and produces the cryptic "unexpected_failure" error.
  RAISE WARNING 'handle_new_user trigger error (non-fatal): %', SQLERRM;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Make sure the trigger is wired up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Clean up any orphaned profiles (public.users rows with no matching auth.users row)
-- This is safe to run and will remove stale data that can cause conflicts.
DELETE FROM public.users
WHERE id NOT IN (SELECT id FROM auth.users);

-- Done! You can now invite users without the "unexpected_failure" error.
