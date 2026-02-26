-- Migration: Add public notes support
-- Adds is_public column to user_notes and updates RLS policies so all authenticated users can read public notes

-- 1. Add is_public column (defaults to false so existing notes remain private)
ALTER TABLE public.user_notes
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- 2. Create an index for efficient querying of public notes
CREATE INDEX IF NOT EXISTS idx_user_notes_is_public
  ON public.user_notes (is_public, created_at DESC)
  WHERE is_public = true;

-- 3. Update RLS policies
-- Drop the existing SELECT policy (owned notes only)
DROP POLICY IF EXISTS "Users can read own notes" ON public.user_notes;

-- Create a new SELECT policy: users can read their own notes OR any public note
CREATE POLICY "Users can read own or public notes"
  ON public.user_notes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_public = true);

-- Ensure INSERT/UPDATE/DELETE policies still restrict to own notes (re-create if needed)
DROP POLICY IF EXISTS "Users can insert own notes" ON public.user_notes;
CREATE POLICY "Users can insert own notes"
  ON public.user_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notes" ON public.user_notes;
CREATE POLICY "Users can update own notes"
  ON public.user_notes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notes" ON public.user_notes;
CREATE POLICY "Users can delete own notes"
  ON public.user_notes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
