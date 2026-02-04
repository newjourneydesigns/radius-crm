-- Add optional notes field to todo_items for additional context
ALTER TABLE todo_items
ADD COLUMN IF NOT EXISTS notes text;
