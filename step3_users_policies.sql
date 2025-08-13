-- STEP 3: Create new non-recursive policies for users table (paste this third)
CREATE POLICY "users_select" ON users
  FOR SELECT TO authenticated 
  USING (
    auth.uid() = id OR 
    public.is_user_acpd(auth.uid())
  );

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

CREATE POLICY "users_insert" ON users
  FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_delete" ON users
  FOR DELETE TO authenticated 
  USING (public.is_user_acpd(auth.uid()));
