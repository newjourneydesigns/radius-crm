-- ============================================================================
-- Fix: shared board members can't SELECT the board itself ("Board not found")
--
-- When a board is shared privately (is_public = false) with specific users via
-- board_members, the recipient could read their board_members row and
-- can_access_board() returned true, but project_boards itself returned no row
-- under RLS — so the board page showed "Board not found".
--
-- The 2026-06-20 migration switched project_boards UPDATE/DELETE to the
-- can_access_board() helper but never added a matching SELECT policy. The only
-- member-facing SELECT policy ("Members can view shared boards") was ineffective
-- in production, so members fell back to owner/public visibility only.
--
-- This adds an explicit, helper-based SELECT policy. RLS SELECT policies are
-- permissive (OR'd), so this only WIDENS visibility to owner + public + members.
-- ============================================================================

DROP POLICY IF EXISTS "Accessible users can view boards" ON public.project_boards;
CREATE POLICY "Accessible users can view boards"
  ON public.project_boards FOR SELECT TO authenticated
  USING (public.can_access_board(id));
