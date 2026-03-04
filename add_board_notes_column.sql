-- Add a freeform notes field to project boards
ALTER TABLE project_boards
  ADD COLUMN IF NOT EXISTS notes text;
