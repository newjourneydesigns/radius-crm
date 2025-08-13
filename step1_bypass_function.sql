-- STEP 1: Create bypass function (paste this first)
CREATE OR REPLACE FUNCTION public.get_user_role_bypass_rls(user_id UUID)
RETURNS user_role AS $$
DECLARE
  user_role_result user_role;
BEGIN
  SELECT role INTO user_role_result 
  FROM public.users 
  WHERE id = user_id;
  RETURN COALESCE(user_role_result, 'Viewer'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
