-- ============================================================================
-- Shared Boards — per-user board membership
--
-- Lets a board owner (or any existing member) grant other users full
-- collaborator access to a specific board. Membership is layered ADDITIVELY on
-- top of the existing owner / is_public RLS: those rules are left untouched and
-- these policies only WIDEN access to members.
--
-- Permission model (owner-protected):
--   • Owner   — full control; only the owner can DELETE the board, and ownership
--               cannot be transferred away by a member.
--   • Member  — view + full edit of cards/columns/labels/comments/checklists,
--               and can add or remove other members. Cannot delete the board.
--   • "Share with everyone" continues to use project_boards.is_public.
-- ============================================================================

-- ── Membership table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_members (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id   uuid NOT NULL REFERENCES public.project_boards(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS board_members_board_id_idx ON public.board_members(board_id);
CREATE INDEX IF NOT EXISTS board_members_user_id_idx ON public.board_members(user_id);

ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;

-- ── Access helpers ──────────────────────────────────────────────────────────
-- SECURITY DEFINER (owned by the migration role, which bypasses RLS) so these
-- can be referenced from policies without causing policy recursion between
-- project_boards and board_members.

CREATE OR REPLACE FUNCTION public.can_access_board(p_board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_boards b
    WHERE b.id = p_board_id
      AND (b.user_id = auth.uid() OR b.is_public = true)
  )
  OR EXISTS (
    SELECT 1 FROM public.board_members m
    WHERE m.board_id = p_board_id
      AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_board_owner(p_board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_boards b
    WHERE b.id = p_board_id AND b.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_card(p_card_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_cards c
    WHERE c.id = p_card_id AND public.can_access_board(c.board_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_board(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_board_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_card(uuid) TO authenticated;

-- ── Prevent a member from hijacking ownership via UPDATE ────────────────────
CREATE OR REPLACE FUNCTION public.prevent_board_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND auth.uid() <> OLD.user_id THEN
    RAISE EXCEPTION 'Only the board owner can transfer ownership';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_board_owner_change ON public.project_boards;
CREATE TRIGGER trg_prevent_board_owner_change
  BEFORE UPDATE ON public.project_boards
  FOR EACH ROW EXECUTE FUNCTION public.prevent_board_owner_change();

-- ── board_members RLS ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Members can view board members" ON public.board_members;
CREATE POLICY "Members can view board members"
  ON public.board_members FOR SELECT TO authenticated
  USING (public.can_access_board(board_id));

DROP POLICY IF EXISTS "Members can add board members" ON public.board_members;
CREATE POLICY "Members can add board members"
  ON public.board_members FOR INSERT TO authenticated
  WITH CHECK (public.can_access_board(board_id) AND added_by = auth.uid());

-- Anyone with board access can remove a member, EXCEPT the owner's row
-- (the owner has no member row, but guard anyway). Members may remove
-- themselves (leave) or others; only the owner is protected.
DROP POLICY IF EXISTS "Members can remove board members" ON public.board_members;
CREATE POLICY "Members can remove board members"
  ON public.board_members FOR DELETE TO authenticated
  USING (
    public.can_access_board(board_id)
    AND user_id <> (SELECT b.user_id FROM public.project_boards b WHERE b.id = board_id)
  );

-- ── project_boards: members can see & update the board (NOT delete) ──────────
DROP POLICY IF EXISTS "Members can view shared boards" ON public.project_boards;
CREATE POLICY "Members can view shared boards"
  ON public.project_boards FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_members m
      WHERE m.board_id = id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can update shared boards" ON public.project_boards;
CREATE POLICY "Members can update shared boards"
  ON public.project_boards FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_members m
      WHERE m.board_id = id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_members m
      WHERE m.board_id = id AND m.user_id = auth.uid()
    )
  );

-- ── Child tables: grant members full collaboration (additive policies) ──────
-- Board-scoped tables.
DROP POLICY IF EXISTS "Members can manage board columns" ON public.board_columns;
CREATE POLICY "Members can manage board columns"
  ON public.board_columns FOR ALL TO authenticated
  USING (public.can_access_board(board_id))
  WITH CHECK (public.can_access_board(board_id));

DROP POLICY IF EXISTS "Members can manage board labels" ON public.board_labels;
CREATE POLICY "Members can manage board labels"
  ON public.board_labels FOR ALL TO authenticated
  USING (public.can_access_board(board_id))
  WITH CHECK (public.can_access_board(board_id));

DROP POLICY IF EXISTS "Members can manage board cards" ON public.board_cards;
CREATE POLICY "Members can manage board cards"
  ON public.board_cards FOR ALL TO authenticated
  USING (public.can_access_board(board_id))
  WITH CHECK (public.can_access_board(board_id));

DROP POLICY IF EXISTS "Members can manage checklist templates" ON public.checklist_templates;
CREATE POLICY "Members can manage checklist templates"
  ON public.checklist_templates FOR ALL TO authenticated
  USING (public.can_access_board(board_id))
  WITH CHECK (public.can_access_board(board_id) AND user_id = auth.uid());

-- Card-scoped tables.
DROP POLICY IF EXISTS "Members can manage card label assignments" ON public.card_label_assignments;
CREATE POLICY "Members can manage card label assignments"
  ON public.card_label_assignments FOR ALL TO authenticated
  USING (public.can_access_card(card_id))
  WITH CHECK (public.can_access_card(card_id));

DROP POLICY IF EXISTS "Members can manage card comments" ON public.card_comments;
CREATE POLICY "Members can manage card comments"
  ON public.card_comments FOR ALL TO authenticated
  USING (public.can_access_card(card_id))
  WITH CHECK (public.can_access_card(card_id));

DROP POLICY IF EXISTS "Members can manage card checklists" ON public.card_checklists;
CREATE POLICY "Members can manage card checklists"
  ON public.card_checklists FOR ALL TO authenticated
  USING (public.can_access_card(card_id))
  WITH CHECK (public.can_access_card(card_id));

DROP POLICY IF EXISTS "Members can manage card checklist groups" ON public.card_checklist_groups;
CREATE POLICY "Members can manage card checklist groups"
  ON public.card_checklist_groups FOR ALL TO authenticated
  USING (public.can_access_card(card_id))
  WITH CHECK (public.can_access_card(card_id));

DROP POLICY IF EXISTS "Members can manage card assignments" ON public.card_assignments;
CREATE POLICY "Members can manage card assignments"
  ON public.card_assignments FOR ALL TO authenticated
  USING (public.can_access_card(card_id))
  WITH CHECK (public.can_access_card(card_id));
