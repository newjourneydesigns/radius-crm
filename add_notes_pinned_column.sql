-- Add pinned column to notes table
-- This enables the pin functionality for notes in the Circle Leader Profile

-- Add the pinned column to the notes table
ALTER TABLE notes 
ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;

-- Add an index for performance when querying pinned notes
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned);

-- Add an index for combined pinned and created_at sorting
CREATE INDEX IF NOT EXISTS idx_notes_pinned_created_at ON notes(pinned, created_at DESC);

-- Update any existing notes to have pinned = false (just to be explicit)
UPDATE notes SET pinned = FALSE WHERE pinned IS NULL;
