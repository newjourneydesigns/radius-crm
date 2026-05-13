-- Allow notebook page owners to share individual notes with other users.
-- Shared users get full note rights, while the owner's folder tree remains private.

CREATE TABLE IF NOT EXISTS notebook_page_shares (
  page_id    uuid NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shared_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notebook_page_shares_user_id
  ON notebook_page_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_notebook_page_shares_shared_by
  ON notebook_page_shares(shared_by);

ALTER TABLE notebook_page_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notebook page shares" ON notebook_page_shares;
DROP POLICY IF EXISTS "Owners can share notebook pages" ON notebook_page_shares;
DROP POLICY IF EXISTS "Users can share accessible notebook pages" ON notebook_page_shares;
DROP POLICY IF EXISTS "Owners and recipients can remove notebook shares" ON notebook_page_shares;

CREATE POLICY "Users can view own notebook page shares"
  ON notebook_page_shares FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR shared_by = auth.uid());

CREATE POLICY "Owners can share notebook pages"
  ON notebook_page_shares FOR INSERT TO authenticated
  WITH CHECK (
    shared_by = auth.uid()
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM notebook_pages
      WHERE notebook_pages.id = notebook_page_shares.page_id
        AND notebook_pages.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and recipients can remove notebook shares"
  ON notebook_page_shares FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR shared_by = auth.uid());

DROP POLICY IF EXISTS "Users can view own notebook pages" ON notebook_pages;
DROP POLICY IF EXISTS "Users can update own notebook pages" ON notebook_pages;
DROP POLICY IF EXISTS "Users can delete own notebook pages" ON notebook_pages;
DROP POLICY IF EXISTS "Users can view accessible notebook pages" ON notebook_pages;
DROP POLICY IF EXISTS "Users can update accessible notebook pages" ON notebook_pages;
DROP POLICY IF EXISTS "Users can delete accessible notebook pages" ON notebook_pages;

CREATE POLICY "Users can view accessible notebook pages"
  ON notebook_pages FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM notebook_page_shares
      WHERE notebook_page_shares.page_id = notebook_pages.id
        AND notebook_page_shares.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update accessible notebook pages"
  ON notebook_pages FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM notebook_page_shares
      WHERE notebook_page_shares.page_id = notebook_pages.id
        AND notebook_page_shares.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM notebook_page_shares
      WHERE notebook_page_shares.page_id = notebook_pages.id
        AND notebook_page_shares.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete accessible notebook pages"
  ON notebook_pages FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM notebook_page_shares
      WHERE notebook_page_shares.page_id = notebook_pages.id
        AND notebook_page_shares.user_id = auth.uid()
    )
  );

-- Existing INSERT policy remains owner-only. Tighten its folder check if it exists.
DROP POLICY IF EXISTS "Users can insert own notebook pages" ON notebook_pages;
CREATE POLICY "Users can insert own notebook pages"
  ON notebook_pages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM notebook_folders
      WHERE notebook_folders.id = notebook_pages.folder_id
        AND notebook_folders.user_id = auth.uid()
    )
  );

-- Page link rows are editable by anyone who can edit the note.
DROP POLICY IF EXISTS "Users can view own notebook page leaders" ON notebook_page_leaders;
DROP POLICY IF EXISTS "Users can insert own notebook page leaders" ON notebook_page_leaders;
DROP POLICY IF EXISTS "Users can delete own notebook page leaders" ON notebook_page_leaders;
DROP POLICY IF EXISTS "Users can view accessible notebook page leaders" ON notebook_page_leaders;
DROP POLICY IF EXISTS "Users can insert accessible notebook page leaders" ON notebook_page_leaders;
DROP POLICY IF EXISTS "Users can delete accessible notebook page leaders" ON notebook_page_leaders;

CREATE POLICY "Users can view accessible notebook page leaders"
  ON notebook_page_leaders FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = notebook_page_leaders.page_id
  ));
CREATE POLICY "Users can insert accessible notebook page leaders"
  ON notebook_page_leaders FOR INSERT TO authenticated
  WITH CHECK (
    linked_by = auth.uid()
    AND EXISTS (SELECT 1 FROM notebook_pages p WHERE p.id = notebook_page_leaders.page_id)
  );
CREATE POLICY "Users can delete accessible notebook page leaders"
  ON notebook_page_leaders FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = notebook_page_leaders.page_id
  ));

DROP POLICY IF EXISTS "Users can view own notebook page boards" ON notebook_page_boards;
DROP POLICY IF EXISTS "Users can insert own notebook page boards" ON notebook_page_boards;
DROP POLICY IF EXISTS "Users can delete own notebook page boards" ON notebook_page_boards;
DROP POLICY IF EXISTS "Users can view accessible notebook page boards" ON notebook_page_boards;
DROP POLICY IF EXISTS "Users can insert accessible notebook page boards" ON notebook_page_boards;
DROP POLICY IF EXISTS "Users can delete accessible notebook page boards" ON notebook_page_boards;

CREATE POLICY "Users can view accessible notebook page boards"
  ON notebook_page_boards FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = notebook_page_boards.page_id
  ));
CREATE POLICY "Users can insert accessible notebook page boards"
  ON notebook_page_boards FOR INSERT TO authenticated
  WITH CHECK (
    linked_by = auth.uid()
    AND EXISTS (SELECT 1 FROM notebook_pages p WHERE p.id = notebook_page_boards.page_id)
  );
CREATE POLICY "Users can delete accessible notebook page boards"
  ON notebook_page_boards FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = notebook_page_boards.page_id
  ));

DROP POLICY IF EXISTS "Users can view own notebook page cards" ON notebook_page_cards;
DROP POLICY IF EXISTS "Users can insert own notebook page cards" ON notebook_page_cards;
DROP POLICY IF EXISTS "Users can delete own notebook page cards" ON notebook_page_cards;
DROP POLICY IF EXISTS "Users can view accessible notebook page cards" ON notebook_page_cards;
DROP POLICY IF EXISTS "Users can insert accessible notebook page cards" ON notebook_page_cards;
DROP POLICY IF EXISTS "Users can delete accessible notebook page cards" ON notebook_page_cards;

CREATE POLICY "Users can view accessible notebook page cards"
  ON notebook_page_cards FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = notebook_page_cards.page_id
  ));
CREATE POLICY "Users can insert accessible notebook page cards"
  ON notebook_page_cards FOR INSERT TO authenticated
  WITH CHECK (
    linked_by = auth.uid()
    AND EXISTS (SELECT 1 FROM notebook_pages p WHERE p.id = notebook_page_cards.page_id)
  );
CREATE POLICY "Users can delete accessible notebook page cards"
  ON notebook_page_cards FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = notebook_page_cards.page_id
  ));

-- Realtime: shared notebook pages should broadcast page edits and link/share changes
-- to every authenticated user who can SELECT the changed row through RLS.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'notebook_pages',
    'notebook_page_shares',
    'notebook_page_leaders',
    'notebook_page_boards',
    'notebook_page_cards'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
