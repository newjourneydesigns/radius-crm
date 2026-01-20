-- Add repeat-series support to todo_items (Apple Reminders-style recurring)

ALTER TABLE todo_items
  ADD COLUMN IF NOT EXISTS series_id UUID,
  ADD COLUMN IF NOT EXISTS is_series_master BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS repeat_rule TEXT,
  ADD COLUMN IF NOT EXISTS repeat_interval INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_todo_items_series_id ON todo_items(series_id);

-- Prevent duplicate occurrences for the same series + due_date
CREATE UNIQUE INDEX IF NOT EXISTS ux_todo_items_series_due_date
  ON todo_items(series_id, due_date)
  WHERE series_id IS NOT NULL AND due_date IS NOT NULL;
