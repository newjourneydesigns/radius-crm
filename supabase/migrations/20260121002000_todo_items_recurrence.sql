-- Ensure todo_items exists and has recurrence + due date fields
-- This migration is idempotent and safe to run even if pieces already exist.

-- Base table
CREATE TABLE IF NOT EXISTS public.todo_items (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  due_date DATE,
  series_id UUID,
  is_series_master BOOLEAN DEFAULT FALSE,
  repeat_rule TEXT,
  repeat_interval INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Columns for older schemas
ALTER TABLE public.todo_items
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS series_id UUID,
  ADD COLUMN IF NOT EXISTS is_series_master BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS repeat_rule TEXT,
  ADD COLUMN IF NOT EXISTS repeat_interval INTEGER DEFAULT 1;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_todo_items_user_id ON public.todo_items(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_completed ON public.todo_items(completed);
CREATE INDEX IF NOT EXISTS idx_todo_items_due_date ON public.todo_items(due_date);
CREATE INDEX IF NOT EXISTS idx_todo_items_series_id ON public.todo_items(series_id);

-- Prevent duplicate occurrences for the same series + due_date
CREATE UNIQUE INDEX IF NOT EXISTS ux_todo_items_series_due_date
  ON public.todo_items(series_id, due_date)
  WHERE series_id IS NOT NULL AND due_date IS NOT NULL;

-- Enable RLS
ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;

-- Policies (guarded for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'todo_items'
      AND policyname = 'Users can view own todos'
  ) THEN
    CREATE POLICY "Users can view own todos"
      ON public.todo_items
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'todo_items'
      AND policyname = 'Users can insert own todos'
  ) THEN
    CREATE POLICY "Users can insert own todos"
      ON public.todo_items
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'todo_items'
      AND policyname = 'Users can update own todos'
  ) THEN
    CREATE POLICY "Users can update own todos"
      ON public.todo_items
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'todo_items'
      AND policyname = 'Users can delete own todos'
  ) THEN
    CREATE POLICY "Users can delete own todos"
      ON public.todo_items
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_todo_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_todo_items_updated_at'
  ) THEN
    CREATE TRIGGER update_todo_items_updated_at
      BEFORE UPDATE ON public.todo_items
      FOR EACH ROW
      EXECUTE FUNCTION public.update_todo_items_updated_at();
  END IF;
END $$;
