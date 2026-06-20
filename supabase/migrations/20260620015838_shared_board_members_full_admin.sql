-- Shared board members should be able to administer the board itself, not just
-- the cards/columns below it. Also explicitly expose board_members to the
-- authenticated role for projects where new public tables are not auto-exposed.

GRANT SELECT, INSERT, DELETE ON TABLE public.board_members TO authenticated;

DROP POLICY IF EXISTS "Accessible users can update board settings" ON public.project_boards;
CREATE POLICY "Accessible users can update board settings"
  ON public.project_boards FOR UPDATE TO authenticated
  USING (public.can_access_board(id))
  WITH CHECK (public.can_access_board(id));

DROP POLICY IF EXISTS "Accessible users can delete boards" ON public.project_boards;
CREATE POLICY "Accessible users can delete boards"
  ON public.project_boards FOR DELETE TO authenticated
  USING (public.can_access_board(id));
