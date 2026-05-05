-- ============================================================
-- Notebook Feature Tables
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. notebook_folders — organizes pages into folders
CREATE TABLE IF NOT EXISTS notebook_folders (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'New Folder',
  icon        text DEFAULT '📁',
  color       text DEFAULT '#6366f1',
  position    integer NOT NULL DEFAULT 0,
  parent_id   uuid REFERENCES notebook_folders(id) ON DELETE CASCADE,
  is_unfiled  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notebook_folders_user_id  ON notebook_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_notebook_folders_parent_id ON notebook_folders(parent_id);

-- 2. notebook_pages — individual rich-text documents
CREATE TABLE IF NOT EXISTS notebook_pages (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id  uuid NOT NULL REFERENCES notebook_folders(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'Untitled',
  content    text DEFAULT '',
  is_pinned  boolean DEFAULT false,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  fts        tsvector GENERATED ALWAYS AS (
               to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
             ) STORED
);

CREATE INDEX IF NOT EXISTS idx_notebook_pages_user_id    ON notebook_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_notebook_pages_folder_id  ON notebook_pages(folder_id);
CREATE INDEX IF NOT EXISTS idx_notebook_pages_updated_at ON notebook_pages(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notebook_pages_fts        ON notebook_pages USING gin(fts);

-- 3. notebook_page_leaders — links pages to circle leaders
CREATE TABLE IF NOT EXISTS notebook_page_leaders (
  page_id          uuid    NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
  circle_leader_id integer NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  linked_by        uuid    NOT NULL REFERENCES auth.users(id),
  linked_at        timestamptz DEFAULT now(),
  PRIMARY KEY (page_id, circle_leader_id)
);

CREATE INDEX IF NOT EXISTS idx_npl_page_id   ON notebook_page_leaders(page_id);
CREATE INDEX IF NOT EXISTS idx_npl_leader_id ON notebook_page_leaders(circle_leader_id);

-- 4. notebook_page_boards — links pages to project boards
CREATE TABLE IF NOT EXISTS notebook_page_boards (
  page_id   uuid NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
  board_id  uuid NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
  linked_by uuid NOT NULL REFERENCES auth.users(id),
  linked_at timestamptz DEFAULT now(),
  PRIMARY KEY (page_id, board_id)
);

CREATE INDEX IF NOT EXISTS idx_npb_page_id  ON notebook_page_boards(page_id);
CREATE INDEX IF NOT EXISTS idx_npb_board_id ON notebook_page_boards(board_id);

-- ============================================================
-- Row-Level Security
-- ============================================================

ALTER TABLE notebook_folders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notebook_pages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notebook_page_leaders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notebook_page_boards   ENABLE ROW LEVEL SECURITY;

-- notebook_folders: users manage only their own
CREATE POLICY "Users can view own notebook folders"
  ON notebook_folders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notebook folders"
  ON notebook_folders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notebook folders"
  ON notebook_folders FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notebook folders"
  ON notebook_folders FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- notebook_pages: users manage only their own
CREATE POLICY "Users can view own notebook pages"
  ON notebook_pages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notebook pages"
  ON notebook_pages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notebook pages"
  ON notebook_pages FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notebook pages"
  ON notebook_pages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- notebook_page_leaders: scoped through the page owner
CREATE POLICY "Users can view own notebook page leaders"
  ON notebook_page_leaders FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = page_id AND p.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert own notebook page leaders"
  ON notebook_page_leaders FOR INSERT TO authenticated
  WITH CHECK (
    linked_by = auth.uid() AND
    EXISTS (SELECT 1 FROM notebook_pages p WHERE p.id = page_id AND p.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own notebook page leaders"
  ON notebook_page_leaders FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = page_id AND p.user_id = auth.uid()
  ));

-- notebook_page_boards: scoped through the page owner
CREATE POLICY "Users can view own notebook page boards"
  ON notebook_page_boards FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = page_id AND p.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert own notebook page boards"
  ON notebook_page_boards FOR INSERT TO authenticated
  WITH CHECK (
    linked_by = auth.uid() AND
    EXISTS (SELECT 1 FROM notebook_pages p WHERE p.id = page_id AND p.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own notebook page boards"
  ON notebook_page_boards FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notebook_pages p WHERE p.id = page_id AND p.user_id = auth.uid()
  ));

-- ============================================================
-- Updated_at Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_notebook_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notebook_folders_updated_at
  BEFORE UPDATE ON notebook_folders
  FOR EACH ROW EXECUTE FUNCTION update_notebook_folders_updated_at();

CREATE OR REPLACE FUNCTION update_notebook_pages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notebook_pages_updated_at
  BEFORE UPDATE ON notebook_pages
  FOR EACH ROW EXECUTE FUNCTION update_notebook_pages_updated_at();
