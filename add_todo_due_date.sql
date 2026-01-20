-- Add optional due_date to todo_items
ALTER TABLE todo_items
ADD COLUMN IF NOT EXISTS due_date DATE;

-- Helpful for sorting/filtering
CREATE INDEX IF NOT EXISTS idx_todo_items_due_date ON todo_items(due_date);
