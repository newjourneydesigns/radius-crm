-- Run this migration to create the todo_items table
-- Execute in your Supabase SQL editor

-- Create todo_items table for dashboard todo list
CREATE TABLE IF NOT EXISTS todo_items (
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

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_todo_items_user_id ON todo_items(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_completed ON todo_items(completed);
CREATE INDEX IF NOT EXISTS idx_todo_items_due_date ON todo_items(due_date);
CREATE INDEX IF NOT EXISTS idx_todo_items_series_id ON todo_items(series_id);

-- Prevent duplicate occurrences for the same series + due_date
CREATE UNIQUE INDEX IF NOT EXISTS ux_todo_items_series_due_date
  ON todo_items(series_id, due_date)
  WHERE series_id IS NOT NULL AND due_date IS NOT NULL;

-- Enable RLS
ALTER TABLE todo_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own todos
CREATE POLICY "Users can view own todos"
  ON todo_items
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own todos
CREATE POLICY "Users can insert own todos"
  ON todo_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own todos
CREATE POLICY "Users can update own todos"
  ON todo_items
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own todos
CREATE POLICY "Users can delete own todos"
  ON todo_items
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_todo_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_todo_items_updated_at
  BEFORE UPDATE ON todo_items
  FOR EACH ROW
  EXECUTE FUNCTION update_todo_items_updated_at();
