-- Add pinned column to user_notes table
ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;

-- Create index for faster lookups by pinned status
CREATE INDEX IF NOT EXISTS idx_user_notes_pinned ON user_notes(user_id, pinned, created_at);
