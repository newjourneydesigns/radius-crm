-- Fix: authenticated non-owners can't load public forms
--
-- The original "Public read active forms" policy was scoped to the `anon` role,
-- so anonymous visitors could fetch active forms but logged-in users who aren't
-- the form owner were blocked by RLS (only "View own forms" applied to them).
-- This adds a matching SELECT policy for the `authenticated` role.

DROP POLICY IF EXISTS "Authenticated read active forms" ON public.board_forms;
CREATE POLICY "Authenticated read active forms"
  ON public.board_forms FOR SELECT TO authenticated
  USING (is_active = true);
