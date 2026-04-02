-- Add per-user custom reminder template columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reminder_template_1 TEXT,
  ADD COLUMN IF NOT EXISTS reminder_template_2 TEXT,
  ADD COLUMN IF NOT EXISTS reminder_template_3 TEXT;
