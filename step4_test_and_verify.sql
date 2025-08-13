-- STEP 4: Test and verify your user profile (paste this last)
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

-- Test the function
SELECT 
  'Testing user role function:' as test,
  public.get_user_role_bypass_rls('6fcfdbc1-758d-4446-920e-e87b77990b33') as your_role,
  public.is_user_acpd('6fcfdbc1-758d-4446-920e-e87b77990b33') as is_acpd;
